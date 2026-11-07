import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {roster} from '../swarm.mjs';
test('failed deployment triggers reviewed fix, same branch commit and exact new deployment verification',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-deploy-')),project=path.join(data,'project');await fs.mkdir(project);await fs.writeFile(path.join(project,'sample.json'),'{"original":true}');
  await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({project,githubRepo:'owner/repo'}));
  const id='12345678-abcd-abcd-abcd-123456789012',job={id,created:new Date().toISOString(),status:'ready',phase:'Published',prompt:'Fix sample',project,selected:roster.map(a=>a.id),agentSnapshot:roster.map(a=>({...a,model:a.candidates.find(m=>!m.startsWith('groq::'))})),inventory:['sample.json'],calls:0,maxCalls:40,events:[],checks:[],files:{'sample.json':{original:'{"original":true}',content:'{"old":true}'}},publishedFiles:{'sample.json':'{"old":true}'},github:{repository:'owner/repo',branch:'pixel-office/test',sha:'a'.repeat(40)},deployment:{state:'NEEDS_CONNECTION',attempts:0}};
  await fs.writeFile(path.join(data,'job-'+id+'.json'),JSON.stringify(job));
  const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
  const child=spawn(process.execPath,['--import',pathToFileURL(path.join(root,'tests/mock-deploy.mjs')).href,path.join(root,'server.mjs')],{env:{...process.env,PIXEL_OFFICE_PORT:String(port),PIXEL_OFFICE_DATA_DIR:data},windowsHide:true,stdio:'pipe'});let logs='';child.stderr.on('data',d=>logs+=d);
  const base='http://127.0.0.1:'+port,post=async(p,data)=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json','X-Pixel-Office':'local'},body:JSON.stringify(data)});assert.equal(r.status,200,await r.text());};
  try{
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    await post('/api/connect',{key:'sk-or-test-only'});await post('/api/github/connect',{token:'ghp_test',repo:'owner/repo'});await post('/api/vercel/connect',{token:'vercel-test-token-only',projectId:'prj_test',teamId:'team_test'});
    let result;
    for(let i=0;i<450;i++){const state=await(await fetch(base+'/api/state')).json();result=state.jobs.find(j=>j.id===id);if(['READY','NEEDS_ATTENTION'].includes(result.deployment.state))break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(result.deployment.state,'READY',JSON.stringify(result)+logs);assert.equal(result.deployment.attempts,1);assert.equal(result.github.sha,'b'.repeat(40));assert.equal(result.deployment.sha,result.github.sha);assert.equal(result.deployment.website.status,'blocked');assert.ok(result.events.some(e=>e.type==='review'));
    assert.equal(await fs.readFile(path.join(project,'sample.json'),'utf8'),'{"original":true}');
    const saved=await fs.readFile(path.join(data,'job-'+id+'.json'),'utf8');assert.ok(!saved.includes('vercel-test-token-only'));assert.ok(!saved.includes('ghp_test'));
  }finally{if(child.exitCode===null){const closed=new Promise(r=>child.once('close',r));child.kill();await closed;}await fs.rm(data,{recursive:true,force:true});}
});

