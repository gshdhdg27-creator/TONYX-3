import {readText,validRelative} from './lib.mjs';
export async function readFiles(job,paths){
  if(!Array.isArray(paths)||!paths.length||paths.length>5)throw Error('Укажите от 1 до 5 файлов.');
  const result={};let size=0;
  for(const p of paths){validRelative(p);const text=job.files[p]?.content??await readText(job.project,p);if(size+text.length>70000){result[p]={error:'Общий лимит чтения 70 КБ. Прочтите этот файл отдельно.'};continue;}result[p]=text;size+=text.length;}
  return result;
}
export async function searchFiles(job,query){
  if(typeof query!=='string'||query.trim().length<2||query.length>100)throw Error('Нужна поисковая строка от 2 до 100 символов.');
  const needle=query.toLowerCase(),results=[];
  const files=[...new Set([...job.inventory,...Object.keys(job.files)])];
  for(const p of files){
    validRelative(p);
    if(p.toLowerCase().includes(needle))results.push({path:p,match:'имя файла'});
    if(results.length>=40)break;
    try{const text=job.files[p]?.content??await readText(job.project,p);const lines=text.split('\n');let count=0;for(let i=0;i<lines.length&&results.length<40;i++){if(lines[i].toLowerCase().includes(needle)){results.push({path:p,line:i+1,text:lines[i].slice(0,240)});if(++count===3)break;}}}catch{}
    if(results.length>=40)break;
  }
  return {query,results,limited:results.length>=40,note:results.length?'Читайте найденные файлы перед правками.':'Совпадений в доступной локальной копии нет. Не выдумывайте существование раздела; уточните актуальность проекта.'};
}
