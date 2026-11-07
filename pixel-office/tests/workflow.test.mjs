import {roster} from '../swarm.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import net from 'node:net';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('full team flow: council, assignment, staged edits, QA failure, repair, apply, backup',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-workflow-')),project=path.join(data,'project');await fs.mkdir(project);
  await fs.writeFile(path.join(project,'sample.json'),'{"original":true}');await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({project}));
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const child=spawn(process.execPath,['--import',pathToFileURL(path.join(root,'tests','mock-provider.mjs')).href,path.join(root,'server.mjs')],{env:{...process.env,PIXEL_OFFICE_PORT:String(port),PIXEL_OFFICE_DATA_DIR:data},windowsHide:true,stdio:'pipe'});let logs='';child.stderr.on('data',d=>logs+=d);
  const base='http://127.0.0.1:'+port;
  const post=(p,obj,extra={})=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json','X-Pixel-Office':'local',...extra},body:JSON.stringify(obj)});
  try{
    for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('Test server exited: '+logs);try{if((await fetch(base+'/api/state',{signal:AbortSignal.timeout(300)})).ok)break;}catch{}await new Promise(r=>setTimeout(r,75));}
    let r=await post('/api/tasks',{prompt:'Create a test file',selected:['architect','coder','qa']});assert.equal(r.status,400,'unauthenticated request must not run');
    r=await post('/api/connect',{key:'sk-or-test-only'});assert.equal(r.status,200,await r.text());
    r=await post('/api/tasks',{prompt:'Create a test file',selected:['architect','coder','qa']},{Origin:'https://attacker.example'});assert.equal(r.status,403,'cross-origin request blocked');
    r=await post('/api/tasks',{prompt:'Create a test file',selected:roster.map(a=>a.id),maxCalls:40});assert.equal(r.status,202,await r.clone().text());const {id}=await r.json();
    let job;
    for(let i=0;i<100;i++){const s=await(await fetch(base+'/api/state')).json();job=s.jobs.find(j=>j.id===id);if(!s.active&&job)break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(job.status,'ready',JSON.stringify(job));assert.equal(job.review.verdict,'pass');assert.ok(job.events.some(e=>e.type==='review'&&e.text.includes('changes_requested')));assert.ok(job.events.some(e=>e.type==='checks'&&e.text.includes('1 ошибок')));
    assert.equal(await fs.readFile(path.join(project,'sample.json'),'utf8'),'{"original":true}','project stays unchanged before apply');
    r=await post('/api/apply',{id});assert.equal(r.status,200,await r.text());assert.equal(JSON.parse(await fs.readFile(path.join(project,'sample.json'),'utf8')).ok,true);
    const backup=JSON.parse(await fs.readFile(path.join(data,'backups',id,'changes.json'),'utf8'));assert.equal(backup['sample.json'].original,'{"original":true}');
    const publicData=await(await fetch(base+'/api/state')).text();assert.ok(!publicData.includes('sk-or-test-only'));
    assert.ok(!(await fs.readFile(path.join(data,`job-${id}.json`),'utf8')).includes('sk-or-test-only'));
    r=await post('/api/chat',{recipient:'coder',message:'Привет, объясни проект',readOnly:true});assert.equal(r.status,202,await r.clone().text());const chatId=(await r.json()).id;
    let chat;
    for(let i=0;i<100;i++){const s=await(await fetch(base+'/api/state')).json();chat=s.jobs.find(j=>j.id===chatId);if(!s.active)break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(chat.status,'discussed');assert.equal(chat.files.length,0,'discussion blocks writes even when model calls write_file');assert.ok(chat.events.some(e=>e.type==='tool_error'&&e.text.includes('Запись запрещена')));assert.equal(chat.dialog.length,2);
    r=await post('/api/chat',{recipient:'coder',conversationId:chatId,message:'Продолжи объяснение',readOnly:true});assert.equal(r.status,202);assert.equal((await r.json()).id,chatId);
    for(let i=0;i<100;i++){const s=await(await fetch(base+'/api/state')).json();chat=s.jobs.find(j=>j.id===chatId);if(!s.active)break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(chat.dialog.length,4,'follow-up stays in the same persistent conversation');assert.equal(chat.files.length,0);
  }finally{if(child.exitCode===null){const closed=new Promise(r=>child.once('close',r));child.kill();await closed;}await fs.rm(data,{recursive:true,force:true});}
});
