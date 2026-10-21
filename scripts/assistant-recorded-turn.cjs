const assert=require('node:assert/strict');global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {recordTurn,reviewRecordedTurn,assertCheckpointPrivacy}=require('../lib/assistant/chat/recorded-turn.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
Date.now=()=>Date.parse('2026-10-22T08:00:00Z');
const session={organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false};
const changes=[{field:'size',slot:'dress',value:'140',quote:'140'},{field:'color',slot:'dress',value:'жёлтое',quote:'жёлтое'}];
const response=x=>({status:'completed',output:[],outputTokens:70,outputText:JSON.stringify(x)});
const steps=[{status:'completed',outputText:'',outputTokens:100,output:[{type:'function_call',name:'remember_and_find',call_id:'fixture',arguments:JSON.stringify({slot:'dress',changes,calendar:{start:{kind:'relative',value:'tomorrow',quote:'на завтра'},days:1,durationQuote:'один день'}})}]},response({message:'Можем рассмотреть другой цвет?',preferenceChanges:changes,cardIds:[],productRefs:[],factRefs:[]})];
(async()=>{
 let calls=0;const raw={syntheticOnly:true,branchId:f.branch,context:emptyOutfit(),messages:[{role:'user',content:'Жёлтое платье размера 140 на завтра на один день'.replace('Ж','ж')}]};
 const candidate=await recordTurn(raw,{create:async()=>{calls++;assert(steps.length);return steps.shift()}},await createCrmTools(session),new AbortController().signal);
 assert.equal(calls,2);assert.equal(candidate.kind,'review');assert.equal(candidate.tape.length,2);const before=f.reads.length;
 const reviewed=await reviewRecordedTurn(candidate,{create:async body=>{calls++;assert.equal(body.text.format.name,'conversation_boundary_review');return response({safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'})}},await createCrmTools(session),new AbortController().signal);
 assert.equal(calls,3);assert.equal(reviewed.kind,'complete');assert.equal(reviewed.reply.context.from,'2026-10-23T15:00');assert.equal(reviewed.reply.context.until,'2026-10-24T12:00');assert.equal(reviewed.reply.context.criteria.dress.size,'140');assert(f.reads.length>before,'fresh catalogue read on continuation');assert(reviewed.reply.facts.some(x=>x.kind==='search'));
 Date.now=()=>Date.parse('2026-10-22T19:01:00Z'); // Almaty crossed midnight.
 const reread=f.reads.length;const cached=await reviewRecordedTurn(reviewed,{create:async()=>{throw Error('paid replay forbidden')}},await createCrmTools(session),new AbortController().signal);assert(f.reads.length>reread,'cached completion revalidates current data without model');assert.equal(cached.reply.context.from,'2026-10-23T15:00','relative date retains original turn clock');
 await assert.rejects(reviewRecordedTurn(candidate,{create:async()=>{throw Error('unknown provider outcome')}},await createCrmTools(session),new AbortController().signal));
 assert.throws(()=>assertCheckpointPrivacy({text:'contact@example.invalid'}));assert.throws(()=>assertCheckpointPrivacy({text:'sk-abcdefghijklmnop'}));
 console.log('PASS: two-stage real orchestration, only one paid-review fixture, no repeated planning, fresh catalogue, anchored relative date, confirmed empty facts, privacy and unknown failure. OFFLINE ONLY');
})().catch(e=>{console.error(e);process.exitCode=1});
