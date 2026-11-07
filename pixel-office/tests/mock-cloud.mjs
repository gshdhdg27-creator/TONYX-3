import './mock-provider.mjs';
const previous=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  const u=new URL(url);
  if(u.hostname!=='api.github.com')return previous(url,options);
  if(u.pathname==='/user')return Response.json({login:'test'});
  if(u.pathname==='/repos/gshdhdg27-creator/TONYX-3')return Response.json({permissions:{push:true},default_branch:'main'});
  if(u.pathname.includes('/git/ref/'))return Response.json({message:'Not found'},{status:404});
  throw Error('Unexpected mock request '+u.pathname);
};
