const preferredFallbacks=['nvidia/nemotron-3.5-super-vl:free','nvidia/nemotron-3-ultra-550b-a55b:free','recursive/flint-v1.0:free','nvidia/nemotron-3.5-lightning:free','cohere/north-mini-code:free','dots-studio/dots-3-note-preview:free'];
export async function requestModel({preferred,catalog,keys,payload,vision=false,signal,onAttempt,onFallback,fetcher=fetch}){
  const eligible=catalog.filter(m=>keys[m.provider||'openrouter']&&(!vision||m.vision));
  const ids=[preferred,...preferredFallbacks,...eligible.map(m=>m.id)];
  const choices=[...new Set(ids)].map(id=>eligible.find(m=>m.id===id)).filter(Boolean).slice(0,3);
  if(!choices.length)throw Error('Нет подключённой бесплатной модели с нужными возможностями.');
  for(let index=0;index<choices.length;index++){
    signal?.throwIfAborted();const model=choices[index],provider=model.provider||'openrouter';
    if(provider==='openrouter'&&!model.id.endsWith(':free'))throw Error('Платная модель запрещена.');
    if(index||model.id!==preferred)await onFallback?.(model);
    await onAttempt(model);
    const r=await fetcher(provider==='groq'?'https://api.groq.com/openai/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${keys[provider]}`,'Content-Type':'application/json','X-Title':'TONYX Pixel Office'},body:JSON.stringify({...payload,model:model.apiModel||model.id}),signal});
    if(r.ok)return {response:r,model};
    const error=await r.json().catch(()=>({})),message=String(error.error?.message||r.statusText);
    const accountLimit=/free-models-per-day|daily limit|daily quota|credits|insufficient balance/i.test(message);
    if(![429,502,503,504].includes(r.status)||accountLimit||index===choices.length-1)throw Error(`${provider} ${r.status}: ${message}${r.status===429?' · Бесплатная квота недоступна. Платные модели не используются.':''}`);
  }
}
