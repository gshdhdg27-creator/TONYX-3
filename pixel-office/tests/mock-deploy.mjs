import './mock-provider.mjs';
const original=globalThis.fetch,first='a'.repeat(40),fixed='b'.repeat(40);let head=first;
globalThis.fetch=async(u,o={})=>{
  const url=new URL(u),p=url.pathname;
  if(url.hostname==='api.github.com'){
    if(p==='/user')return Response.json({login:'owner'});
    if(p==='/repos/owner/repo')return Response.json({permissions:{push:true},default_branch:'main'});
    if(p.includes('/git/ref/'))return Response.json({object:{sha:head}});
    if(p.includes('/git/refs/')&&o.method==='PATCH'){const b=JSON.parse(o.body);if(b.force||head!==first)throw Error('unsafe update');head=b.sha;return Response.json({});}
    if(p.endsWith('/git/trees'))return Response.json({sha:'newtree'});
    if(p.endsWith('/git/commits'))return Response.json({sha:fixed});
    if(p.includes('/git/commits/'))return Response.json({tree:{sha:'oldtree'}});
    if(p.includes('/git/trees/'))return Response.json({tree:[{path:'sample.json',mode:'100644',sha:'blob'}]});
    if(p.includes('/git/blobs/'))return Response.json({encoding:'base64',content:Buffer.from('{"old":true}').toString('base64')});
    if(p.endsWith('/status'))return Response.json({statuses:[{context:'Vercel',state:'success'}]});
    if(p.endsWith('/check-runs'))return Response.json({check_runs:[]});
    throw Error('Unexpected GitHub '+p);
  }
  if(url.hostname==='api.vercel.com'){
    if(p.startsWith('/v9/projects/'))return Response.json({id:'prj_test',name:'test',link:{type:'github',org:'owner',repo:'repo'}});
    if(p==='/v6/deployments')return Response.json({deployments:[{uid:'dpl_test',meta:{githubCommitSha:head}}]});
    if(p.startsWith('/v13/'))return Response.json({id:'dpl_test',projectId:'prj_test',meta:{githubCommitSha:head},readyState:head===first?'ERROR':'READY',url:'test.vercel.app'});
    if(p.endsWith('/events'))return Response.json([{text:'Build failed: sample.json invalid'}]);
    throw Error('Unexpected Vercel '+p);
  }
  if(url.hostname==='test.vercel.app')return new Response('',{status:401});
  if(url.hostname==='openrouter.ai'&&p.endsWith('/chat/completions')){
    const b=JSON.parse(o.body),system=b.messages[0].content;let message;
    if(system.includes('Ты независимый проверяющий'))message={content:JSON.stringify({verdict:'pass',issues:[],summary:'Test repair reviewed',manualTests:[]})};
    else if(b.tools)message=b.messages.some(m=>m.role==='tool')?{content:'Repair completed'}:{tool_calls:[{index:0,id:'repair',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:'sample.json',content:'{"fixed":true}'})}}]};
    if(message)return new Response(`data: ${JSON.stringify({choices:[{delta:message}]})}\n\ndata: [DONE]\n\n`);
  }
  return original(u,o);
};
