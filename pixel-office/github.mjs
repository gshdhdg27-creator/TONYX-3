import {validRelative} from './lib.mjs';

export function repositoryName(value){
  const name=String(value||'').trim().replace(/^https:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/\/$/,'');
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name))throw Error('Укажите репозиторий в формате владелец/название.');
  return name;
}
export function githubClient(token,fetcher=fetch){
  return async(route,method='GET',body)=>{
    const r=await fetcher('https://api.github.com'+route,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json','User-Agent':'TONYX-Pixel-Office'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    const result=await r.json().catch(()=>({}));
    if(!r.ok){const e=Error(`GitHub ${r.status}: ${result.message||r.statusText}`);e.status=r.status;throw e;}
    return result;
  };
}
const encoded=p=>p.split('/').map(encodeURIComponent).join('/');
export async function checkGithub(token,repo,fetcher=fetch){
  const call=githubClient(token,fetcher),name=repositoryName(repo);
  const account=await call('/user');const info=await call('/repos/'+name);
  if(info.permissions?.push===false)throw Error('У этого аккаунта нет права записи в репозиторий.');
  return {repository:name,login:account.login,defaultBranch:info.default_branch};
}
export async function publishJob(job,token,repo,fetcher=fetch){
  if(!token)throw Error('Подключите GitHub в настройках.');
  if(job.status!=='ready'&&job.status!=='applied')throw Error('Отправка возможна только после успешного ревью.');
  const name=repositoryName(repo),base='/repos/'+name,call=githubClient(token,fetcher);
  const branch='pixel-office/'+job.created.slice(0,10)+'-'+job.id;
  // A stable branch makes retries idempotent, including an interrupted HTTP response.
  try{const existing=await call(base+'/git/ref/heads/'+branch);return {branch,sha:existing.object.sha,url:`https://github.com/${name}/tree/${branch}`,repository:name};}catch(e){if(e.status!==404)throw e;}
  const info=await call(base),head=await call(base+'/git/ref/heads/'+encoded(info.default_branch)),parent=head.object.sha;
  const commit=await call(base+'/git/commits/'+parent);
  const tree=await call(base+'/git/trees/'+commit.tree.sha+'?recursive=1');
  if(tree.truncated)throw Error('Дерево GitHub слишком велико для безопасной автоматической отправки.');
  const changes=[];
  for(const [rel,file] of Object.entries(job.files)){
    validRelative(rel);const entry=tree.tree.find(e=>e.path===rel);
    if(entry && !['100644','100755'].includes(entry.mode))throw Error(`Неподдерживаемый тип файла на GitHub: ${rel}`);
    let remote=null;
    if(entry){const blob=await call(base+'/git/blobs/'+entry.sha);if(blob.encoding!=='base64')throw Error('GitHub вернул неподдерживаемое содержимое.');remote=Buffer.from(blob.content.replace(/\n/g,''),'base64').toString('utf8');}
    // Treat only line ending differences as equal, preserving genuine concurrent edits.
    const normalize=v=>v===null?null:v.replace(/\r\n/g,'\n');
    if(normalize(remote)!==normalize(file.original))throw Error(`Конфликт: ${rel} на GitHub отличается от исходника задачи. Ничего не отправлено; сначала синхронизируйте проект.`);
    changes.push({path:rel,mode:entry?.mode||'100644',type:'blob',content:file.content});
  }
  if(!changes.length)throw Error('Нет изменений для отправки.');
  const nextTree=await call(base+'/git/trees','POST',{base_tree:commit.tree.sha,tree:changes});
  const nextCommit=await call(base+'/git/commits','POST',{message:`Pixel Office: ${job.prompt.replace(/\s+/g,' ').slice(0,100)}`,tree:nextTree.sha,parents:[parent]});
  await call(base+'/git/refs','POST',{ref:'refs/heads/'+branch,sha:nextCommit.sha});
  const verified=await call(base+'/git/ref/heads/'+branch);
  if(verified.object.sha!==nextCommit.sha)throw Error('Не удалось подтвердить опубликованную ветку.');
  return {branch,sha:nextCommit.sha,url:`https://github.com/${name}/tree/${branch}`,compareUrl:`https://github.com/${name}/compare/${encodeURIComponent(info.default_branch)}...${encodeURIComponent(branch)}`,repository:name};
}

export async function publishRevision(job,token,fetcher=fetch){
  if(job.status!=='ready'||!job.github||!job.publishedFiles)throw Error('Исправление не прошло проверку или нет исходного коммита.');
  const {repository,branch,sha}=job.github;
  if(!branch.startsWith('pixel-office/'))throw Error('Разрешены только ветки офиса.');
  const base='/repos/'+repositoryName(repository),call=githubClient(token,fetcher);
  const head=await call(base+'/git/ref/heads/'+encoded(branch));
  if(head.object.sha!==sha)throw Error('Ветка изменена другим участником. Автоисправление остановлено.');
  const commit=await call(base+'/git/commits/'+sha),tree=await call(base+'/git/trees/'+commit.tree.sha+'?recursive=1');
  if(tree.truncated)throw Error('Дерево репозитория слишком велико.');
  const changes=[];
  for(const [rel,file] of Object.entries(job.files)){
    validRelative(rel);const expected=Object.hasOwn(job.publishedFiles,rel)?job.publishedFiles[rel]:file.original;
    if(file.content===expected)continue;
    const entry=tree.tree.find(e=>e.path===rel);let remote=null;
    if(entry){if(!['100644','100755'].includes(entry.mode))throw Error('Неподдерживаемый тип файла.');const blob=await call(base+'/git/blobs/'+entry.sha);if(blob.encoding!=='base64')throw Error('Неподдерживаемый формат файла.');remote=Buffer.from(blob.content.replace(/\n/g,''),'base64').toString('utf8');}
    if(remote?.replace(/\r\n/g,'\n')!==expected?.replace(/\r\n/g,'\n'))throw Error('Конфликт при исправлении: '+rel);
    changes.push({path:rel,mode:entry?.mode||'100644',type:'blob',content:file.content});
  }
  if(!changes.length)throw Error('Агент не подготовил изменений для исправления деплоя.');
  const nextTree=await call(base+'/git/trees','POST',{base_tree:commit.tree.sha,tree:changes});
  const next=await call(base+'/git/commits','POST',{message:'Pixel Office: repair deployment '+job.id,tree:nextTree.sha,parents:[sha]});
  await call(base+'/git/refs/heads/'+encoded(branch),'PATCH',{sha:next.sha,force:false});
  const verified=await call(base+'/git/ref/heads/'+encoded(branch));
  if(verified.object.sha!==next.sha)throw Error('Не удалось подтвердить коммит исправления.');
  return {...job.github,sha:next.sha};
}
