import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createPhoneGateway} from '../phone-gateway.mjs';

test('phone access requires exact owner, HTTPS origin and hostname; preserves API and event stream',async()=>{
  const upstream=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/api/events'?'text/event-stream':'application/json');res.end(req.url==='/api/events'?'data: {"ok":true}\n\n':JSON.stringify({host:req.headers.host,origin:req.headers.origin,identity:req.headers['tailscale-user-login']}));});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const port=upstream.address().port;
  const gateway=createPhoneGateway({hostname:'acer.test.ts.net',login:'owner@example.com',upstreamPort:port});
  await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
  const request=(extra={},method='GET',path='/api/state')=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:gateway.address().port,path,method,headers:{host:'acer.test.ts.net','tailscale-user-login':'owner@example.com',...extra}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}));});req.on('error',reject);req.end();
  });
  try{
    assert.equal((await request({'tailscale-user-login':''})).status,403);
    assert.equal((await request({'tailscale-user-login':'other@example.com'})).status,403);
    assert.equal((await request({host:'attacker.example'})).status,403);
    assert.equal((await request({origin:'https://attacker.example'})).status,403);
    assert.equal((await request({'sec-fetch-site':'cross-site'})).status,403);
    assert.equal((await request({},'POST')).status,403);
    const result=await request({origin:'https://acer.test.ts.net','content-type':'application/json','x-pixel-office':'local'},'POST');
    assert.equal(result.status,200);assert.deepEqual(JSON.parse(result.body),{host:'127.0.0.1:'+port,origin:'http://127.0.0.1:'+port});
    assert.equal((await request({},'GET','/api/events')).body,'data: {"ok":true}\n\n');
  }finally{await new Promise(r=>gateway.close(r));await new Promise(r=>upstream.close(r));}
});
