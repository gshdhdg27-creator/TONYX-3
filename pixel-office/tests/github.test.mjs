import test from 'node:test';
import assert from 'node:assert/strict';
import {publishJob} from '../github.mjs';
const job={id:'test-id',created:'2026-11-06T00:00:00Z',status:'ready',prompt:'Fix sample',files:{'src/sample.js':{original:'old\r\n',content:'new\n'}}};
function fixture(conflict=false){const posts=[];let published=false;const fetcher=async(url,options)=>{const pathname=new URL(url).pathname;
 if(options.method==='POST'){const b=JSON.parse(options.body);posts.push({pathname,body:b});if(pathname.endsWith('/git/trees'))return Response.json({sha:'new-tree'});if(pathname.endsWith('/git/commits'))return Response.json({sha:'new-commit'});if(pathname.endsWith('/git/refs')){published=true;return Response.json({ref:b.ref});}}
 if(pathname.includes('/git/ref/heads/pixel-office/'))return published?Response.json({object:{sha:'new-commit'}}):Response.json({message:'Not Found'},{status:404});
 if(pathname.endsWith('/repos/owner/repo'))return Response.json({default_branch:'main'});
 if(pathname.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'head'}});
 if(pathname.endsWith('/git/commits/head'))return Response.json({tree:{sha:'base-tree'}});
 if(pathname.endsWith('/git/trees/base-tree'))return Response.json({tree:[{path:'src/sample.js',mode:'100644',sha:'blob'}],truncated:false});
 if(pathname.endsWith('/git/blobs/blob'))return Response.json({encoding:'base64',content:Buffer.from(conflict?'someone else\n':'old\n').toString('base64')});
 throw Error('Unexpected path '+pathname);
 };return {posts,fetcher};}
test('GitHub publishing preserves base tree and creates isolated branch; retry is idempotent',async()=>{const f=fixture();const out=await publishJob(job,'test-token','owner/repo',f.fetcher);assert.equal(out.sha,'new-commit');assert.equal(f.posts[0].body.base_tree,'base-tree');assert.deepEqual(f.posts[1].body.parents,['head']);assert.equal(f.posts[2].body.ref,'refs/heads/pixel-office/2026-11-06-test-id');assert.equal(f.posts.length,3);await publishJob(job,'test-token','owner/repo',f.fetcher);assert.equal(f.posts.length,3);});
test('remote conflict or failed audit blocks all GitHub writes',async()=>{const f=fixture(true);await assert.rejects(()=>publishJob(job,'test-token','owner/repo',f.fetcher),/Конфликт/);assert.equal(f.posts.length,0);await assert.rejects(()=>publishJob({...job,status:'needs_work'},'test-token','owner/repo',f.fetcher),/ревью/);});
