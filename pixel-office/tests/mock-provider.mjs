import {roster} from '../swarm.mjs';
// Test process only. No network requests and no real accounts are used.
const original=globalThis.fetch;let reviews=0;
const ids=[...new Set(roster.flatMap(a=>a.candidates).filter(id=>!id.startsWith('groq::')))];
globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://openrouter.ai/'))return original(url,options);
  if(String(url).endsWith('/models'))return Response.json({data:ids.map(id=>({id,name:id,pricing:{prompt:'0',completion:'0'},supported_parameters:['tools']}))});
  if(String(url).endsWith('/key'))return Response.json({data:{is_free_tier:true}});
  const body=JSON.parse(options.body),system=body.messages[0].content;let message;
  if(system.includes('Выбери распределение'))message={content:JSON.stringify({summary:'TEST',backend:'Prepare sample.json',frontend:'Not required',uiRequired:false,acceptance:['Valid JSON'],tests:['Parse JSON']})};
  else if(system.includes('Ты независимый проверяющий')){reviews++;message={content:JSON.stringify({verdict:reviews===1?'changes_requested':'pass',issues:reviews===1?['Fix invalid JSON']:[],summary:'TEST review',manualTests:['Run project tests']})};}
  else if(body.tools){
    const fixing=body.messages[1].content.includes('Исправь конкретные');
    if(body.messages.some(m=>m.role==='tool'))message={content:'TEST completed'};
    else message={tool_calls:[{index:0,id:'test-call',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:'sample.json',content:fixing?' {"ok":true} ':'{invalid'})}}]};
  } else message={content:'TEST council proposal'};
  const wire=`data: ${JSON.stringify({choices:[{delta:message}]})}\n\ndata: [DONE]\n\n`;
  return new Response(new ReadableStream({start(c){const b=new TextEncoder().encode(wire);c.enqueue(b.slice(0,23));c.enqueue(b.slice(23));c.close();}}),{headers:{'content-type':'text/event-stream'}});
};
