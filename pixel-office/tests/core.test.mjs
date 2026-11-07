import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validRelative,safeFile,stageFile,assertUnchanged,inventory,freeModels,parseObject} from '../lib.mjs';

test('agent cannot escape project or read credentials',()=>{
  for(const p of ['../outside.js','/tmp/file.js','C:/file.js','sub\\file.js','foo/../../file.js','.env','.env.local','sub/secrets.json','.git/config','file.js:stream','nul.js','sub./a.js','sub /a.js'])assert.throws(()=>validRelative(p),p);
  assert.equal(validRelative('src/game.ts'),'src/game.ts');
});
test('only verifiably free tool-capable models are enabled',()=>{
  const model={id:'test/a:free',pricing:{prompt:'0',completion:'0'},supported_parameters:['tools']};
  assert.equal(freeModels([model]).length,1);
  assert.equal(freeModels([{...model,id:'test/paid'},{...model,pricing:{prompt:'1',completion:'0'}},{...model,pricing:{}},{...model,supported_parameters:[]}]).length,0);
});
test('staging preserves original, shares changes, detects concurrent edits',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-office-test-'));
  try{await fs.writeFile(path.join(dir,'main.js'),'const original = 1;');const job={project:dir,files:{}};
    await stageFile(job,'main.js','const changed = 2;');assert.equal(await fs.readFile(path.join(dir,'main.js'),'utf8'),'const original = 1;');
    await assertUnchanged(job);await stageFile(job,'main.js','const changedAgain = 3;');assert.equal(job.files['main.js'].original,'const original = 1;');
    await stageFile(job,'new/file.json','{}');assert.equal(job.files['new/file.json'].original,null);
    await fs.writeFile(path.join(dir,'main.js'),'user edit');await assert.rejects(()=>assertUnchanged(job),/изменился/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('inventory excludes keys, dependencies and binary data',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-office-test-'));
  try{await fs.mkdir(path.join(dir,'node_modules'));await fs.writeFile(path.join(dir,'node_modules','ignore.js'),'x');await fs.writeFile(path.join(dir,'app.js'),'x');await fs.writeFile(path.join(dir,'.env.local'),'private');await fs.writeFile(path.join(dir,'secret.json'),'private');await fs.writeFile(path.join(dir,'photo.png'),'binary');assert.deepEqual(await inventory(dir),['app.js']);}
  finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('symlink paths cannot cross project boundary',async(t)=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-office-test-'));
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-office-outside-'));
  try{try{await fs.symlink(outside,path.join(dir,'linked'),'junction');}catch(e){if(e.code==='EPERM'){t.skip('OS denies symlink creation');return;}throw e;}await assert.rejects(()=>safeFile(dir,'linked/file.js'),/Ссылки/);}
  finally{await fs.rm(dir,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});}
});
test('planner structured response supports fenced JSON and rejects prose',()=>{assert.deepEqual(parseObject('```json\n{"assignments":[]}\n```'),{assignments:[]});assert.throws(()=>parseObject('No plan'));});
