export function validateImages(images=[]){
 if(!Array.isArray(images)||images.length>2)throw Error('Можно приложить до двух изображений.');
 return images.map(image=>{
  if(typeof image?.dataUrl!=='string'||image.dataUrl.length>3000000)throw Error('Изображение слишком большое: до 2 МБ.');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataUrl);if(!match)throw Error('Поддерживаются PNG, JPEG и WebP.');
  const b=Buffer.from(match[2],'base64');if(b.length>2000000)throw Error('Изображение слишком большое.');
  const valid=match[1]==='png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?b[0]===255&&b[1]===216&&b[2]===255:b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';
  if(!valid)throw Error('Содержимое не соответствует формату изображения.');
  return {name:String(image.name||'Макет').slice(0,120),dataUrl:image.dataUrl};
 });
}
