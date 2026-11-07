import {lookup} from 'node:dns/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import {scrubLog} from './deployments.mjs';

export async function inspectBrowser(url,screenshotPath){
  const target=new URL(url);
  if(target.protocol!=='https:'||!/^[-a-z0-9]+\.vercel\.app$/.test(target.hostname)||target.port||target.username||target.password)throw Error('Недопустимый адрес сайта.');
  const addresses=await lookup(target.hostname,{all:true,family:4});
  const publicAddress=addresses.find(({address})=>! /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(18|19)\.|22[4-9]\.|2[3-5]\d\.)/.test(address));
  if(!publicAddress)throw Error('Сайт не имеет публичного адреса.');
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true,args:[`--host-resolver-rules=MAP ${target.hostname} ${publicAddress.address}`,'--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:false});
    let blocked=0;const errors=[],responses=[];
    await context.route('**/*',route=>{const req=route.request();let address;try{address=new URL(req.url());}catch{return route.abort();}
      if(address.origin!==target.origin||!['GET','HEAD','OPTIONS'].includes(req.method())){blocked++;return route.abort();}return route.continue();});
    await context.routeWebSocket('**/*',socket=>socket.close());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(scrubLog(e.message)));
    page.on('response',r=>{if(r.status()>=500&&r.url().startsWith(target.origin+'/'))responses.push({status:r.status(),path:new URL(r.url()).pathname});});
    page.on('dialog',d=>void d.dismiss());
    await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForTimeout(2500);
    await fs.mkdir(path.dirname(screenshotPath),{recursive:true});await page.screenshot({path:screenshotPath,fullPage:false});
    const title=await page.title(),text=(await page.locator('body').innerText()).slice(0,6000);
    // Blocked external requests can cause errors that are specific to this test environment.
    const failed=(errors.length||responses.length)&&!blocked;
    return {status:failed?'failed':blocked?'limited':'passed',title,text:scrubLog(text),errors:errors.slice(0,10),responses:responses.slice(0,10),blocked,screenshot:true,summary:failed?'Браузер обнаружил ошибки страницы.':blocked?'Сайт открыт, снимок сохранён. Проверка ограничена: внешние запросы и действия записи заблокированы.':'Страница открыта в мобильном браузере, снимок сохранён, необработанных ошибок не обнаружено. Это не проверка всех пользовательских сценариев.'};
  }finally{await browser.close();}
}
