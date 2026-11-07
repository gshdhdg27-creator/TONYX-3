export const departments=[
 {id:'architecture',name:'Архитектура и контекст',label:'АТЛАС',color:'#f6c177'},
 {id:'engineering',name:'Разработка и код',label:'КОД',color:'#8cdbff'},
 {id:'creative',name:'UI/UX и анимации',label:'ПИКСИ + МОТИ',color:'#c4a7e7'},
 {id:'security',name:'Безопасность и QA',label:'СКАУТ + СЕЙФ',color:'#9dd9b0'}
];
const SUPER='nvidia/nemotron-3.5-super-vl:free',ULTRA='nvidia/nemotron-3-ultra-550b-a55b:free',CODE='cohere/north-mini-code:free',FLINT='recursive/flint-v1.0:free',DOTS='dots-studio/dots-3-note-preview:free',GEMMA='google/gemma-4-26b-a4b-it:free',LIGHT='nvidia/nemotron-3.5-lightning:free';
const definitions=[
 ['architect','Атлас','architecture',true,'Главный архитектор, контекст и координация',SUPER,[SUPER]],
 ['strategist','Стратег','architecture',false,'Декомпозиция, схемы и дерево файлов','google/gemma-4-26b-a4b:free',[GEMMA,LIGHT]],
 ['logs','Логос','architecture',false,'Анализ логов, ошибок и стектрейсов','thinkingmachines/inkling:free',['liquid/lfm-2.5-2.6b:free',DOTS]],
 ['coder','Код','engineering',true,'Сеньор-разработчик: API, асинхронность, БД и TON','qwen/qwen3.8-27b:free',['groq::qwen/qwen3.8-27b',ULTRA,FLINT,CODE]],
 ['sprinter','Спринтер','engineering',false,'Быстрый набросок функций, JSON и SQL',CODE,[CODE]],
 ['pair','Флинт','engineering',false,'Парный кодер: рефакторинг и обработка ошибок','recursive/flint:free',[FLINT,CODE]],
 ['designer','Пикси','creative',true,'React, UI/UX и Tailwind',LIGHT,[LIGHT]],
 ['motion','Моти','creative',false,'Canvas, Three.js, WebGL и производительность','meta-llama/llama-3.3-70b-instruct:free',['groq::llama-3.3-70b-versatile','nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',FLINT]],
 ['layout','Адапт','creative',false,'Мобильная вёрстка Telegram WebApp','dots-studio/dots3-note:free',[DOTS,LIGHT]],
 ['qa','Скаут','security',true,'Независимый аудит: initData, инъекции, гонки и утечки','deepseek/deepseek-r1:free',[SUPER,ULTRA]],
 ['tester','Тестер','security',false,'Автотесты PyTest/Jest и граничные случаи','qwen/qwen2.5-coder-32b-instruct:free',[CODE,FLINT]],
 ['validator','Сейф','security',false,'Типы данных, границы доверия и Telegram initData','respan/span-01-lite:free',['google/gemma-4-31b-it:free',SUPER]]
];
export const roster=definitions.map(([id,name,department,leader,role,requestedModel,candidates])=>({id,name,department,leader,role,requestedModel,candidates,provider:'openrouter',model:candidates[0],color:departments.find(d=>d.id===department).color}));
export const requiredIds=roster.filter(a=>a.department!=='creative').map(a=>a.id);
export function resolveRoster(current,catalog){
 const previous=new Map((current||[]).map(a=>[a.id,a]));
 return roster.map(a=>{
   const old=previous.get(a.id),custom=old?.customModel===true;
   const choices=custom?[old.model]:[a.requestedModel,...a.candidates];
   const model=choices.find(id=>catalog.some(m=>m.id===id))||choices[0];
   return {...a,model,customModel:custom,availability:catalog.some(m=>m.id===model)?'available':'unavailable',substitution:model!==a.requestedModel};
 });
}
export function validateSelection(selected){
 if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(id=>!roster.some(a=>a.id===id)))throw Error('Некорректный состав команды.');
 const missing=requiredIds.filter(id=>!selected.includes(id));if(missing.length)throw Error('Конвейер требует архитектуру, разработку и независимый QA: '+missing.join(', '));
 const creative=roster.filter(a=>a.department==='creative');if(creative.some(a=>selected.includes(a.id))&&!creative.every(a=>selected.includes(a.id)))throw Error('UI-департамент включается целиком: лидер и два помощника.');
 return selected;
}
export function validatePlan(plan){
 if(!plan||typeof plan.summary!=='string'||typeof plan.uiRequired!=='boolean'||!Array.isArray(plan.acceptance)||!plan.acceptance.length||!Array.isArray(plan.tests)||!plan.tests.length||typeof plan.backend!=='string'||typeof plan.frontend!=='string')throw Error('План не содержит разделения frontend/backend, критериев приёмки или проверок.');
 return plan;
}
export function aggregateReviews(reviews,checks){
 return {verdict:reviews.every(r=>r.verdict==='pass')&&!checks.some(c=>c.ok===false)?'pass':'changes_requested',issues:[...reviews.flatMap(r=>r.issues||[]),...checks.filter(c=>c.ok===false).map(c=>`${c.file}: ${c.message||c.kind}`)],summary:reviews.map(r=>`${r.agentName}: ${r.summary||r.verdict}`).join('\n'),manualTests:[...new Set(reviews.flatMap(r=>r.manualTests||[]))]};
}
// Deterministic department boundaries. Models may propose work, but cannot skip audit.
export async function executePipeline(job,ops){
 const phase=async(id,title)=>{job.phase=title;job.phaseId=id;await ops.phase(id,title);};
 await phase('planning','1/4 · Архитектура и контекст');
 const strategy=await ops.consult('strategist','Раздели задачу на backend/frontend, файлы и зависимости. Учитывай фактический стек, не мигрируй его без просьбы.');
 const logs=await ops.consult('logs','Разбери предоставленные ошибки и возможные причины. Если логов нет, прямо скажи это. Не выдумывай наблюдения.');
 job.plan=validatePlan(await ops.plan({strategy,logs}));
 if(job.plan.uiRequired&&!job.selected.includes('designer'))throw Error('План требует UI-департамент. Включите его и запустите задачу заново.');
 await phase('draft','2/4 · Первичный код');
 await ops.work('sprinter','Подготовь минимальный первичный код по плану. Сохрани совместимость. Не заменяй рабочую систему фиктивными данными.');
 await phase('refinement','3/4 · Парная доработка');
 await ops.work('coder','Проверь набросок Спринтера и доведи до рабочего решения: асинхронность, API, БД, обработка ошибок. try/except используй только в Python; в TypeScript — подходящие конструкции.');
 await ops.work('pair','Проведи парное ревью подготовленных файлов и точечный рефакторинг. Исправь обработку ошибок и нарушения контрактов. Не начинай задачу заново.');
 if(job.plan.uiRequired){await ops.work('designer','Реализуй UI по плану, сохрани архитектуру React и принятые стили.');await ops.work('motion','Проверь и при необходимости реализуй математику, анимации и производительность. Не добавляй 3D, если задача его не требует.');await ops.work('layout','Проверь мобильную вёрстку, safe-area и Telegram WebApp.');}
 await ops.work('tester','Добавь содержательные регрессионные тесты и крайние случаи для фактического тестового стека. Не заявляй, что они выполнены, если запуска не было.');
 await phase('audit','4/4 · Независимый аудит');
 let verdict;
 for(let round=0;round<3;round++){
   const checks=await ops.checks();
   const validation=await ops.review('validator','Валидация входных типов и серверная проверка Telegram initData: подпись/HMAC, auth_date, replay, границы доверия. Отмечай только относящиеся к изменению проблемы.');
   const audit=await ops.review('qa','Глубокий аудит: инъекции, гонки, транзакции, авторизация, TON/Web3 и утечки. Учитывай результаты Сейфа: '+JSON.stringify(validation));
   verdict=aggregateReviews([validation,audit],checks);job.review=verdict;await ops.verdict(verdict);
   if(verdict.verdict==='pass'||round===2)break;
   await ops.work('coder','Исправь конкретные замечания независимого QA без расширения задачи: '+JSON.stringify(verdict));
 }
 return verdict;
}
