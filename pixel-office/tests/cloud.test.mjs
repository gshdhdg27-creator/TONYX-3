import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import net from 'node:net';
import http from 'node:http';
import {backupStore} from '../cloud-backup.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const password='test-cloud-password-with-32-characters';
// Node fetch normalizes Host; exercise the real reverse-proxy Host with HTTP.
function fetch(url,options={}){return new Promise((resolve,reject)=>{const req=http.request(url,options,res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);req.end(options.body);});}
test('encrypted backup restores exact content and rejects a competing writer',async()=>{
  let head=null,seq=0;const blobs=new Map(),trees=new Map(),commits=new Map();
  const api=async(url,options)=>{
    const route=new URL(url).pathname.split('/git/')[1],body=options.body?JSON.parse(options.body):null;
    if(route==='ref/heads/pixel-office-state')return head?Response.json({object:{sha:head}}):Response.json({message:'missing'},{status:404});
    if(options.method==='GET'){
      const [type,id]=route.split('/');return Response.json((type==='commits'?commits:type==='trees'?trees:blobs).get(id));
    }
    if(route.startsWith('refs')){if(body.force===false)assert.equal(commits.get(body.sha).parents[0],head);head=body.sha;return Response.json({});}
    const sha='object-'+(++seq);
    if(route==='blobs')blobs.set(sha,{encoding:'base64',content:Buffer.from(body.content).toString('base64')});
    if(route==='trees')trees.set(sha,{tree:body.tree});
    if(route==='commits')commits.set(sha,{...body,tree:{sha:body.tree}});
    return Response.json({sha});
  };
  const a=backupStore('test','owner/repo',password,api),data={jobs:[{prompt:'private'}]};
  await assert.rejects(()=>a.save(data),/Сначала/);assert.equal(await a.load(),null);await a.save(data);
  const b=backupStore('test','owner/repo',password,api);assert.deepEqual(await b.load(),data);
  await a.save({jobs:[]});await assert.rejects(()=>b.save(data),/Другой экземпляр/);
  assert.ok([...blobs.values()].every(b=>!Buffer.from(b.content,'base64').toString().includes('private')));
});
test('cloud HTTP hides office behind password, permits health check and rejects foreign origins',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'office-cloud-'));
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const child=spawn(process.execPath,['--import',pathToFileURL(path.join(root,'tests/mock-cloud.mjs')).href,path.join(root,'server.mjs')],{env:{...process.env,PIXEL_OFFICE_CLOUD:'1',PIXEL_OFFICE_PORT:String(port),PIXEL_OFFICE_DATA_DIR:data,PIXEL_OFFICE_PROJECT_DIR:data,RENDER_EXTERNAL_HOSTNAME:'test-office.onrender.com',OFFICE_PASSWORD:password,GITHUB_TOKEN:'test-only',VERCEL_TOKEN:'',OPENROUTER_API_KEY:''},windowsHide:true,stdio:'pipe'});
  let logs='';child.stderr.on('data',d=>logs+=d);
  const url='http://127.0.0.1:'+port,headers={Host:'test-office.onrender.com',Authorization:'Basic '+Buffer.from('office:'+password).toString('base64')};
  try{
    let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(url+'/healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,60));}assert.ok(ready);
    assert.equal((await fetch(url+'/api/state')).status,401);
    assert.equal((await fetch(url+'/',{headers})).status,200);
    const state=await(await fetch(url+'/api/state',{headers})).text();assert.equal(JSON.parse(state).cloud,true);assert.ok(!state.includes(password));assert.ok(!state.includes('test-only'));
    assert.equal((await fetch(url+'/api/state',{headers:{...headers,Host:'attacker.example'}})).status,403);
    assert.equal((await fetch(url+'/api/stop',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Pixel-Office':'local',Origin:'https://attacker.example'},body:'{}'})).status,403);
    assert.equal((await fetch(url+'/api/stop',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Pixel-Office':'local',Origin:'https://test-office.onrender.com'},body:'{}'})).status,200);
  }finally{if(child.exitCode===null){const closed=new Promise(r=>child.once('close',r));child.kill();await closed;}await fs.rm(data,{recursive:true,force:true});}
});
