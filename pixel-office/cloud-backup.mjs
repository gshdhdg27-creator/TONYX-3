import crypto from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {githubClient,repositoryName} from './github.mjs';
export function seal(data,password){
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.scryptSync(password,salt,32),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const bytes=Buffer.concat([cipher.update(gzipSync(JSON.stringify(data))),cipher.final()]);
  return JSON.stringify({v:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')});
}
export function unseal(text,password){
  const value=JSON.parse(text);if(value.v!==1)throw Error('Неизвестный формат копии.');
  const key=crypto.scryptSync(password,Buffer.from(value.salt,'base64'),32),decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  return JSON.parse(gunzipSync(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]),{maxOutputLength:50000000}).toString('utf8'));
}
export function backupStore(token,repo,password,fetcher=fetch){
  const call=githubClient(token,fetcher),base='/repos/'+repositoryName(repo),branch='pixel-office-state';let head=null,loaded=false;
  return {
    async load(){
      try{
        const ref=await call(base+'/git/ref/heads/'+branch);head=ref.object.sha;
        const commit=await call(base+'/git/commits/'+head),tree=await call(base+'/git/trees/'+commit.tree.sha),entry=tree.tree.find(e=>e.path==='office.enc');
        if(!entry)throw Error('Ветка резервной копии имеет неизвестное содержимое.');
        const blob=await call(base+'/git/blobs/'+entry.sha);const result=unseal(Buffer.from(blob.content.replace(/\n/g,''),'base64').toString('utf8'),password);loaded=true;return result;
      }catch(e){if(e.status===404&&head===null){loaded=true;return null;}throw e;}
    },
    async save(data){
      if(!loaded)throw Error('Сначала загрузите предыдущую резервную копию.');
      const encrypted=seal(data,password);if(encrypted.length>20000000)throw Error('Резервная копия превысила 20 МБ; экспортируйте и архивируйте старые задачи.');
      if(head){const ref=await call(base+'/git/ref/heads/'+branch);if(ref.object.sha!==head)throw Error('Другой экземпляр офиса обновил копию. Сохранение остановлено.');}
      const blob=await call(base+'/git/blobs','POST',{content:encrypted,encoding:'utf-8'});
      const tree=await call(base+'/git/trees','POST',{tree:[{path:'office.enc',mode:'100644',type:'blob',sha:blob.sha},{path:'vercel.json',mode:'100644',type:'blob',content:JSON.stringify({git:{deploymentEnabled:false}})}]});
      const commit=await call(base+'/git/commits','POST',{message:'Encrypted Pixel Office checkpoint',tree:tree.sha,parents:head?[head]:[]});
      if(head)await call(base+'/git/refs/heads/'+branch,'PATCH',{sha:commit.sha,force:false});
      else await call(base+'/git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});
      head=commit.sha;
    }
  };
}
