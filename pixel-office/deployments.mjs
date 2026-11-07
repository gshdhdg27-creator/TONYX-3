import {githubClient,repositoryName} from './github.mjs';

export function scrubLog(text,secrets=[]){
  let result=String(text||'');
  for(const secret of secrets)if(secret)result=result.split(secret).join('[скрыто]');
  return result.replace(/(?:sk-[\w-]+|github_pat_[\w]+|gh[pousr]_[\w]+|gsk_[\w]+)/g,'[скрыто]').replace(/((?:token|password|secret|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;]+/gi,'$1[скрыто]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[скрыто]@').slice(-14000);
}
export function vercelClient(token,teamId,fetcher=fetch){
  if(!token)throw Error('Подключите Vercel в настройках.');
  return async(route)=>{
    const url=new URL(route,'https://api.vercel.com');
    if(url.origin!=='https://api.vercel.com')throw Error('Неверный адрес Vercel.');
    if(teamId)url.searchParams.set('teamId',teamId);
    const r=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(25000)});
    const value=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(`Vercel ${r.status}: ${value.error?.message||r.statusText}`);
    return value;
  };
}
export async function connectVercel(token,config,repo,fetcher=fetch){
  if(!/^prj_[\w]+$/.test(config.projectId)||!/^team_[\w]+$/.test(config.teamId))throw Error('Нужны Project ID и Team ID Vercel.');
  const project=await vercelClient(token,config.teamId,fetcher)('/v9/projects/'+encodeURIComponent(config.projectId));
  const link=project.link;
  if(link?.type!=='github'||`${link.org}/${link.repo}`.toLowerCase()!==repositoryName(repo).toLowerCase())throw Error('Этот проект Vercel не связан с выбранным репозиторием GitHub. Проверьте Settings → Git в Vercel.');
  return {projectId:project.id,teamId:config.teamId,name:project.name};
}
export async function deploymentForCommit(token,config,sha,fetcher=fetch){
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Неверный commit SHA.');
  const call=vercelClient(token,config.teamId,fetcher);
  const list=await call('/v6/deployments?'+new URLSearchParams({projectId:config.projectId,limit:'100','meta-githubCommitSha':sha}));
  const found=(list.deployments||[]).filter(d=>d.meta?.githubCommitSha===sha).sort((a,b)=>(b.created||b.createdAt||0)-(a.created||a.createdAt||0))[0];
  if(!found)return {state:'WAITING',sha,summary:'Ждём деплой именно отправленного коммита. Проверьте Git Integration, если он не появляется.'};
  const detail=await call('/v13/deployments/'+encodeURIComponent(found.uid||found.id));
  if(detail.meta?.githubCommitSha!==sha||detail.projectId!==config.projectId)throw Error('Деплой не соответствует коммиту или проекту.');
  const result={id:detail.id||found.uid,sha,state:detail.readyState||detail.state,url:detail.url?'https://'+detail.url:null,checkedAt:new Date().toISOString()};
  if(result.state==='ERROR'){
    const events=await call('/v3/deployments/'+encodeURIComponent(result.id)+'/events?limit=150&direction=backward&builds=1');
    result.logs=scrubLog((Array.isArray(events)?events:events.events||[]).map(e=>e.text||e.payload?.text||'').join('\n'),[token]);
    result.summary='Сборка Vercel завершилась ошибкой.';
  }else result.summary=result.state==='READY'?'Vercel успешно собрал этот коммит.':'Статус Vercel: '+result.state;
  return result;
}
export async function githubChecks(token,repo,sha,fetcher=fetch){
  const call=githubClient(token,fetcher),base='/repos/'+repositoryName(repo)+'/commits/'+encodeURIComponent(sha);
  const [status,checks]=await Promise.allSettled([call(base+'/status'),call(base+'/check-runs')]);
  return {statuses:status.status==='fulfilled'?(status.value.statuses||[]).map(s=>({name:s.context,state:s.state,url:s.target_url})):[],checks:checks.status==='fulfilled'?(checks.value.check_runs||[]).map(c=>({name:c.name,state:c.status,conclusion:c.conclusion,url:c.html_url})):[],errors:[status,checks].filter(r=>r.status==='rejected').map(r=>r.reason.message)};
}
export async function inspectWebsite(url,fetcher=fetch){
  const target=new URL(url);
  if(target.protocol!=='https:'||!/^[-a-z0-9]+\.vercel\.app$/.test(target.hostname)||target.port||target.username||target.password)throw Error('Проверяется только адрес деплоя *.vercel.app из Vercel API.');
  const r=await fetcher(target,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(r.status===401||r.status===403)return {status:'blocked',http:r.status,summary:'Preview защищён входом Vercel. Это не ошибка приложения; проверка сайта требует доступа.'};
  if(r.status>=300&&r.status<400)return {status:'blocked',http:r.status,summary:'Сайт перенаправляет посетителя. Автоматическая проверка не следует за входом или внешним адресом.'};
  const reader=r.body?.getReader();let html='';const decoder=new TextDecoder();
  if(reader){while(html.length<500000){const {done,value}=await reader.read();if(done)break;html+=decoder.decode(value,{stream:true});}await reader.cancel();}
  return {status:r.ok?'http_ok':'failed',http:r.status,title:html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]||'',summary:r.ok?'Страница отвечает. HTTP-проверка не подтверждает работу кнопок, Telegram, платежей или отсутствие ошибок JavaScript.':'Страница вернула HTTP '+r.status};
}
