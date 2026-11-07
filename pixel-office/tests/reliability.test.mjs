import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {requestModel} from '../provider-request.mjs';
import {readFiles,searchFiles} from '../project-search.mjs';
import {seal,unseal} from '../cloud-backup.mjs';
import {createCloudAuth} from '../cloud-auth.mjs';
const ids=['cohere/north-mini-code:free','nvidia/nemotron-3.5-super-vl:free','nvidia/nemotron-3-ultra-550b-a55b:free'];
test('429 switches to verified free candidate, counts each request and announces fallback',async()=>{
  const attempts=[],fallbacks=[];const result=await requestModel({preferred:ids[0],catalog:ids.map(id=>({id,provider:'openrouter'})),keys:{openrouter:'test'},payload:{},onAttempt:m=>attempts.push(m.id),onFallback:m=>fallbacks.push(m.id),fetcher:async()=>attempts.length===1?Response.json({error:{message:'Provider returned error'}},{status:429}):new Response('ok')});
  assert.equal(result.model.id,ids[1]);assert.deepEqual(attempts,ids.slice(0,2));assert.deepEqual(fallbacks,[ids[1]]);
});
test('account quota, bad credentials and exhausted fallback never loop or use paid models',async()=>{
  for(const [status,message,expected] of [[429,'daily limit exceeded',1],[401,'invalid key',1],[503,'unavailable',3]]){let count=0;await assert.rejects(()=>requestModel({preferred:ids[0],catalog:ids.map(id=>({id})),keys:{openrouter:'test'},payload:{},onAttempt:()=>count++,fetcher:async()=>Response.json({error:{message}},{status})}));assert.equal(count,expected);}
  let called=false;await assert.rejects(()=>requestModel({preferred:'paid',catalog:[{id:'paid'}],keys:{openrouter:'test'},payload:{},onAttempt:()=>{called=true}}),/Платная/);assert.equal(called,false);
});
test('batch read uses staged changes; search finds relevant source without exposing secrets',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'office-search-'));
  try{await fs.writeFile(path.join(root,'games.tsx'),'const title="Соло";');await fs.writeFile(path.join(root,'.env'),'SECRET=value');const job={project:root,inventory:['games.tsx'],files:{'cards.tsx':{content:'solo card'}}};
    assert.equal((await readFiles(job,['cards.tsx']))['cards.tsx'],'solo card');assert.equal((await searchFiles(job,'Соло')).results[0].path,'games.tsx');await assert.rejects(()=>readFiles(job,['.env']));await assert.rejects(()=>readFiles(job,Array(6).fill('games.tsx')));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('cloud backup is authenticated encryption, wrong password and tampering fail',()=>{
  const password='test-password-with-at-least-24-chars',data={jobs:[{prompt:'Private task',files:{}}]};const encrypted=seal(data,password);assert.ok(!encrypted.includes('Private task'));assert.deepEqual(unseal(encrypted,password),data);assert.throws(()=>unseal(encrypted,'wrong-password'));const damaged=JSON.parse(encrypted);damaged.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>unseal(JSON.stringify(damaged),password));
});
test('cloud auth rejects anonymous and wrong password and admits only office login',()=>{
  const password='test-password-with-at-least-24-chars',auth=createCloudAuth(password);let code;const res={writeHead:c=>code=c,end:()=>{}};
  assert.equal(auth({headers:{}},res),false);assert.equal(code,401);
  assert.equal(auth({headers:{authorization:'Basic '+Buffer.from('other:'+password).toString('base64')}},res),false);
  assert.equal(auth({headers:{authorization:'Basic '+Buffer.from('office:'+password).toString('base64')}},res),true);assert.throws(()=>createCloudAuth('short'));
});
