import crypto from 'node:crypto';
export function createCloudAuth(password){
  if(typeof password!=='string'||password.length<24)throw Error('OFFICE_PASSWORD должен содержать минимум 24 символа.');
  const expected=crypto.createHash('sha256').update('office:'+password).digest();
  return (req,res)=>{
    const encoded=req.headers.authorization;
    const actual=crypto.createHash('sha256').update(typeof encoded==='string'&&encoded.startsWith('Basic ')?Buffer.from(encoded.slice(6),'base64').toString('utf8'):'').digest();
    if(crypto.timingSafeEqual(actual,expected))return true;
    res.writeHead(401,{'WWW-Authenticate':'Basic realm="Pixel Office", charset="UTF-8"','Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Войдите: имя office, пароль из OFFICE_PASSWORD в Render.');return false;
  };
}
