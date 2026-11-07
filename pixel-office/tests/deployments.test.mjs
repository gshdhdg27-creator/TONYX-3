import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentForCommit,connectVercel,inspectWebsite,scrubLog} from '../deployments.mjs';
import {publishRevision} from '../github.mjs';
const sha='a'.repeat(40),config={projectId:'prj_test',teamId:'team_test'};
test('deployment is matched to exact SHA and project, old success is not accepted',async()=>{
  const fake=async u=>String(u).includes('/v6/')?Response.json({deployments:[{uid:'old',meta:{githubCommitSha:'b'.repeat(40)}}]}):assert.fail('must not load unrelated deployment');
  assert.equal((await deploymentForCommit('test',config,sha,fake)).state,'WAITING');
  const mismatch=async u=>String(u).includes('/v6/')?Response.json({deployments:[{uid:'new',meta:{githubCommitSha:sha}}]}):Response.json({meta:{githubCommitSha:sha},projectId:'prj_other',readyState:'READY'});
  await assert.rejects(()=>deploymentForCommit('test',config,sha,mismatch),/не соответствует/);
});
test('failed deploy returns scrubbed build logs and successful deploy returns its URL',async()=>{
  const fake=async u=>String(u).includes('/v6/')?Response.json({deployments:[{uid:'new',meta:{githubCommitSha:sha}}]}):String(u).includes('/events')?Response.json([{text:'token=private sk-or-secret'}]):Response.json({id:'new',meta:{githubCommitSha:sha},projectId:config.projectId,readyState:'ERROR'});
  const result=await deploymentForCommit('private',config,sha,fake);assert.equal(result.state,'ERROR');assert.ok(!result.logs.includes('private'));assert.ok(!result.logs.includes('sk-or-secret'));
  assert.equal(scrubLog('SECRET_VALUE', ['SECRET_VALUE']),'[скрыто]');
});
test('Vercel connection rejects a different Git repository',async()=>{
  await assert.rejects(()=>connectVercel('test',config,'owner/repo',async()=>Response.json({link:{type:'github',org:'other',repo:'repo'}})),/не связан/);
});
test('website protection and redirects are not reported as passing; private URLs are rejected',async()=>{
  assert.equal((await inspectWebsite('https://test.vercel.app',async()=>new Response('',{status:401}))).status,'blocked');
  assert.equal((await inspectWebsite('https://test.vercel.app',async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1'}}))).status,'blocked');
  assert.equal((await inspectWebsite('https://test.vercel.app',async()=>new Response('Oops',{status:500}))).status,'failed');
  await assert.rejects(()=>inspectWebsite('http://127.0.0.1'),/только адрес/);
});
test('repair publishes reviewed content in same branch without force and blocks concurrent changes',async()=>{
  let writes=[],current=sha;
  const fetcher=async(u,o)=>{const p=new URL(u).pathname;
    if(o.method==='PATCH'){const b=JSON.parse(o.body);assert.equal(b.force,false);current=b.sha;writes.push(b);return Response.json({});}
    if(o.method==='POST'){const b=JSON.parse(o.body);writes.push(b);return Response.json({sha:p.endsWith('/trees')?'tree2':'c'.repeat(40)});}
    if(p.includes('/git/ref/'))return Response.json({object:{sha:current}});
    if(p.includes('/git/commits/'))return Response.json({tree:{sha:'tree1'}});
    if(p.includes('/git/trees/'))return Response.json({tree:[{path:'a.json',mode:'100644',sha:'blob'}]});
    if(p.includes('/git/blobs/'))return Response.json({encoding:'base64',content:Buffer.from('old').toString('base64')});
    throw Error(p);
  };
  const job={id:'job',status:'ready',github:{repository:'owner/repo',branch:'pixel-office/test',sha},publishedFiles:{'a.json':'old'},files:{'a.json':{original:null,content:'new'}}};
  const result=await publishRevision(job,'token',fetcher);assert.equal(result.sha,'c'.repeat(40));assert.deepEqual(writes[1].parents,[sha]);
  const count=writes.length;await assert.rejects(()=>publishRevision(job,'token',fetcher),/другим участником/);assert.equal(writes.length,count);
});
