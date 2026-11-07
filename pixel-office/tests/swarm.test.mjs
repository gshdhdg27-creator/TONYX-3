import test from 'node:test';
import assert from 'node:assert/strict';
import {roster,departments,resolveRoster,validateSelection,executePipeline,aggregateReviews} from '../swarm.mjs';
import {validateImages} from '../attachments.mjs';

test('four departments each contain a leader and two assistants',()=>{
 assert.equal(roster.length,12);assert.equal(new Set(roster.map(a=>a.id)).size,12);
 for(const d of departments){const members=roster.filter(a=>a.department===d.id);assert.equal(members.length,3);assert.equal(members.filter(a=>a.leader).length,1);}
});
test('requested unavailable models remain visible; replacements must exist in catalog',()=>{
 const catalog=[{id:'nvidia/nemotron-3.5-super-vl:free'},{id:'cohere/north-mini-code:free'}];
 const result=resolveRoster([],catalog);const coder=result.find(a=>a.id==='coder');assert.equal(coder.requestedModel,'qwen/qwen3.8-27b:free');assert.equal(coder.model,'cohere/north-mini-code:free');assert.equal(coder.substitution,true);
 const strategist=result.find(a=>a.id==='strategist');assert.equal(strategist.availability,'unavailable');
});
test('custom model is never silently replaced; QA cannot be deselected',()=>{
 const result=resolveRoster([{id:'coder',customModel:true,model:'chosen:free'}],[{id:'cohere/north-mini-code:free'}]);assert.equal(result.find(a=>a.id==='coder').model,'chosen:free');assert.equal(result.find(a=>a.id==='coder').availability,'unavailable');
 assert.throws(()=>validateSelection(roster.filter(a=>a.id!=='qa').map(a=>a.id)));
 assert.throws(()=>validateSelection(roster.filter(a=>a.id!=='layout').map(a=>a.id)));
 assert.doesNotThrow(()=>validateSelection(roster.filter(a=>a.department!=='creative').map(a=>a.id)));
});
test('fixed pipeline orders draft before pair and blocks result until both auditors pass',async()=>{
 const calls=[];let validation=0;
 const job={selected:roster.map(a=>a.id)};
 const ops={phase:async(id)=>calls.push('phase:'+id),consult:async(id)=>{calls.push('consult:'+id);return 'report';},plan:async()=>({summary:'plan',backend:'backend',frontend:'UI',uiRequired:true,acceptance:['A'],tests:['T']}),work:async(id)=>calls.push('work:'+id),checks:async()=>[],review:async(id)=>{calls.push('review:'+id);const fail=id==='validator'&&validation++===0;return {agentName:id,verdict:fail?'changes_requested':'pass',issues:fail?['fix']:[],manualTests:[]};},verdict:async()=>{}};
 const verdict=await executePipeline(job,ops);assert.equal(verdict.verdict,'pass');
 assert.ok(calls.indexOf('work:sprinter')<calls.indexOf('work:coder'));assert.ok(calls.indexOf('work:coder')<calls.indexOf('work:pair'));assert.ok(calls.indexOf('work:tester')<calls.indexOf('review:validator'));
 assert.equal(calls.filter(c=>c==='work:coder').length,2);assert.equal(calls.filter(c=>c==='review:qa').length,2);assert.equal(calls.filter(c=>c==='phase:audit').length,1);
});
test('audit failure or syntax failure cannot be converted to success by another reviewer',()=>{
 assert.equal(aggregateReviews([{verdict:'pass',issues:[]},{verdict:'changes_requested',issues:['critical']}],[]).verdict,'changes_requested');
 assert.equal(aggregateReviews([{verdict:'pass',issues:[]}],[{ok:false,file:'a.py',message:'syntax'}]).verdict,'changes_requested');
});
test('attachments enforce type, count and size before sending to vision model',()=>{
 assert.throws(()=>validateImages([{dataUrl:'data:text/html;base64,PGgxPg=='}]));assert.throws(()=>validateImages([{dataUrl:'data:image/png;base64,PGgxPg=='}]));assert.throws(()=>validateImages([{}, {}, {}]));
 const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');assert.equal(validateImages([{name:'layout',dataUrl:png}]).length,1);
});
