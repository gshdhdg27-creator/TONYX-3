import http from 'node:http';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Only Tailscale Serve may expose this loopback listener. Never use Funnel.
export function createPhoneGateway({hostname,login,upstreamPort=8799}) {
  if(!/^[a-z0-9.-]+\.ts\.net$/.test(hostname)||!login) throw Error('Invalid phone access configuration');
  const origin='https://'+hostname;
  return http.createServer((req,res)=>{
    const deny=()=>{res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Доступ только владельцу офиса через Tailscale.');};
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return deny();
    if(req.headers['tailscale-user-login']!==login) return deny();
    if(![hostname,hostname+':443'].includes(req.headers.host)) return deny();
    if(req.headers.origin && req.headers.origin!==origin) return deny();
    if(req.headers['sec-fetch-site']==='cross-site') return deny();
    if(!['GET','POST'].includes(req.method)) return deny();
    if(req.method==='POST' && (req.headers.origin!==origin||req.headers['x-pixel-office']!=='local'||!req.headers['content-type']?.startsWith('application/json'))) return deny();
    const headers={...req.headers,host:'127.0.0.1:'+upstreamPort};
    for(const key of Object.keys(headers)) if(key.startsWith('tailscale-')||key.startsWith('x-forwarded-')||['forwarded','connection','upgrade','proxy-authorization','proxy-connection'].includes(key)) delete headers[key];
    if(headers.origin) headers.origin='http://127.0.0.1:'+upstreamPort;
    const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,method:req.method,path:req.url,headers},response=>{
      res.writeHead(response.statusCode,{...response.headers,'Cache-Control':'no-store'});
      response.pipe(res);
    });
    upstream.on('error',()=>{if(!res.headersSent){res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('Офис сейчас выключен. Открой его на ноутбуке.');}else res.destroy();});
    req.on('aborted',()=>upstream.destroy());
    res.on('close',()=>upstream.destroy());
    req.pipe(upstream);
  });
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const config=JSON.parse(await fs.readFile(new URL('./data/phone-access.json',import.meta.url),'utf8'));
  createPhoneGateway(config).listen(18800,'127.0.0.1',()=>console.log('Pixel Office phone gateway: loopback port 18800'));
}
