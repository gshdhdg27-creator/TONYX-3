import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const blocked = new Set(['.git','.codex','.agents','.claude','.gemini','.aws','.ssh','.vercel','node_modules','dist','build','.next','coverage']);
const textExtensions = new Set(['.js','.mjs','.cjs','.jsx','.ts','.tsx','.json','.css','.scss','.html','.svg','.md','.txt','.yaml','.yml','.toml','.py','.sql','.glsl','.vert','.frag','.obj','.mtl','.gltf','.xml','.csv','.gitignore']);
export function validRelative(input) {
  if (typeof input !== 'string' || !input || input.length > 400 || input.includes('\\') || input.includes(':') || input.includes('\0') || input.startsWith('/')) throw Error('Нужен относительный путь внутри проекта, через /.');
  const parts = input.split('/');
  if(parts.some(p => !p || p==='.' || p==='..' || blocked.has(p.toLowerCase()) || p.endsWith('.') || p.endsWith(' ') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p))) throw Error('Этот путь недоступен.');
  if(parts.some(p => /^\.env($|\.)/i.test(p) || /(^|[._-])(secrets?|credentials?|tokens?|auth)([._-]|$)/i.test(p) || /\.(pem|key|p12|pfx|sqlite|db)$/i.test(p))) throw Error('Файлы с ключами и учётными данными недоступны агентам.');
  if(!textExtensions.has(path.extname(input).toLowerCase()) && !['Dockerfile','.gitignore'].includes(parts.at(-1))) throw Error('Поддерживаются только текстовые файлы кода и ресурсов.');
  return input;
}
export async function safeFile(root, relative) {
  validRelative(relative);
  const canonical = await fs.realpath(root);
  const target = path.resolve(canonical, ...relative.split('/'));
  if(!target.startsWith(canonical + path.sep)) throw Error('Путь вне проекта.');
  let cursor = canonical;
  for(const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    try { if((await fs.lstat(cursor)).isSymbolicLink()) throw Error('Ссылки и перенаправления папок не поддерживаются.'); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  return target;
}
export const hash = text => crypto.createHash('sha256').update(text).digest('hex');
export async function readText(root, rel) {
  const target = await safeFile(root,rel);
  const st = await fs.stat(target);
  if(!st.isFile() || st.size > 300000) throw Error('Файл слишком большой (лимит 300 КБ).');
  return fs.readFile(target,'utf8');
}
export async function inventory(root, limit=600) {
  const result=[];
  async function walk(dir, prefix='', depth=0) {
    if(depth>12 || result.length>=limit)return;
    const entries = await fs.readdir(dir,{withFileTypes:true});
    for(const e of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      if(result.length>=limit)break;
      if(e.isSymbolicLink() || blocked.has(e.name.toLowerCase()) || e.name.startsWith('.env'))continue;
      const rel=prefix+e.name;
      if(e.isDirectory())await walk(path.join(dir,e.name),rel+'/',depth+1);
      else {try{validRelative(rel);result.push(rel);}catch{}}
    }
  }
  await walk(root); return result;
}
export function freeModels(data) {
  return (data||[]).filter(m=>m.id?.endsWith(':free') && m.pricing?.prompt != null && m.pricing?.completion != null && Number(m.pricing.prompt)===0 && Number(m.pricing.completion)===0 && m.supported_parameters?.includes('tools')).map(m=>({id:m.id,name:m.name,context:m.context_length,vision:m.architecture?.input_modalities?.includes('image')===true}));
}
export function parseObject(text) {
  const clean=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  try{return JSON.parse(clean);}catch{const start=clean.indexOf('{'),end=clean.lastIndexOf('}');if(start>=0&&end>start)return JSON.parse(clean.slice(start,end+1));throw Error('Модель не вернула ожидаемый JSON.');}
}
export async function stageFile(job, relative, content) {
  validRelative(relative);
  if(typeof content!=='string'||Buffer.byteLength(content)>200000)throw Error('Лимит одного изменения — 200 КБ.');
  if(Object.keys(job.files).length>=40&&!job.files[relative])throw Error('Лимит — 40 изменённых файлов на задачу.');
  await safeFile(job.project,relative);
  if(!job.files[relative]){
    let original=null;try{original=await readText(job.project,relative);}catch(e){if(e.code!=='ENOENT')throw e;}
    job.files[relative]={original,base:original===null?null:hash(original),content};
  } else job.files[relative].content=content;
  return {path:relative,bytes:Buffer.byteLength(content),status:'Изменение подготовлено; исходный проект ещё не изменён.'};
}
export async function assertUnchanged(job) {
  for(const [rel,change] of Object.entries(job.files)){
    let current=null;try{current=await readText(job.project,rel);}catch(e){if(e.code!=='ENOENT')throw e;}
    if((current===null?null:hash(current))!==change.base)throw Error(`Файл ${rel} изменился после начала задачи. Применение остановлено.`);
  }
}
