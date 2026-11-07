import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {backupStore} from './cloud-backup.mjs';
const repo='gshdhdg27-creator/TONYX-3';
if(!process.env.OFFICE_PASSWORD||process.env.OFFICE_PASSWORD.length<24)throw Error('Задайте OFFICE_PASSWORD (24+ символа).');
if(!process.env.GITHUB_TOKEN)throw Error('Задайте GITHUB_TOKEN для сохранения задач.');
process.env.PIXEL_OFFICE_CLOUD='1';process.env.PIXEL_OFFICE_PROJECT_DIR='/tmp/tonyx-project';process.env.PIXEL_OFFICE_DATA_DIR='/tmp/office-data';
await fs.mkdir(process.env.PIXEL_OFFICE_DATA_DIR,{recursive:true});
const store=backupStore(process.env.GITHUB_TOKEN,repo,process.env.OFFICE_PASSWORD);
const restored=await store.load();
if(restored){
  if(restored.settings)await fs.writeFile(path.join(process.env.PIXEL_OFFICE_DATA_DIR,'settings.json'),JSON.stringify({...restored.settings,project:process.env.PIXEL_OFFICE_PROJECT_DIR}));
  if(restored.usage)await fs.writeFile(path.join(process.env.PIXEL_OFFICE_DATA_DIR,'usage.json'),JSON.stringify(restored.usage));
  for(const job of restored.jobs||[]){if(!/^[a-f0-9-]{36}$/.test(job.id))throw Error('Неверный идентификатор задачи в копии.');job.project=process.env.PIXEL_OFFICE_PROJECT_DIR;await fs.writeFile(path.join(process.env.PIXEL_OFFICE_DATA_DIR,'job-'+job.id+'.json'),JSON.stringify(job));}
}
try{await fs.access(path.join(process.env.PIXEL_OFFICE_PROJECT_DIR,'.git'));}catch{
  await new Promise((resolve,reject)=>{const p=spawn('git',['clone','--depth','1','--branch','main','https://github.com/'+repo+'.git',process.env.PIXEL_OFFICE_PROJECT_DIR],{stdio:'inherit'});p.on('error',reject);p.on('close',c=>c===0?resolve():reject(Error('Не удалось загрузить исходники TONYX-3.')));});
}
await import('./server.mjs');
