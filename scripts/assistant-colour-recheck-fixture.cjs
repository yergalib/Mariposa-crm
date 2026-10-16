const fs=require('node:fs'),path=require('node:path');
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts'),{createCrmTools}=require('../lib/assistant/chat/tools.ts'),{emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const allowed=new Set(['remember_preferences','find_cheaper','find_dresses','read_variant','read_batch']);
module.exports=async(a,dir)=>{
 const context=emptyOutfit();Object.assign(context,{from:'2026-10-23T12:00',until:'2026-10-24T18:00',heightCm:138,notes:['Не люблю объёмные платья.'],calendarPeriod:true,recentCards:[{variantId:f.id(20),productId:f.id(10),executionId:null,slot:'dress'}]});context.criteria.dress={size:'140',color:'Белый',categoryId:f.category};
 const prompt='Лучше синее, остальные пожелания и даты те же. Есть вариант дешевле первого?';
 const trace=[],seen=new Set();const save=()=>fs.writeFileSync(path.join(dir,'safe-tool-trace.json'),JSON.stringify(trace,null,2));
 const provider={create:async(body,signal)=>{
  for(const item of body.input??[])if(item.type==='function_call_output'&&!seen.has(item.call_id)){
   seen.add(item.call_id);let r;try{r=JSON.parse(item.output)}catch{}
   trace.push({kind:'tool-result',error:Boolean(r?.error),cardsCount:Array.isArray(r?.cards)?r.cards.length:null,referencePresent:Boolean(r?.reference),savedColour:r?.context?.criteria?.dress?.color===null?'null':r?.context?.criteria?.dress?.color?'positive':'not-returned'});
  }
  save();const response=await a.provider.create(body,signal);
  for(const call of response.output??[])if(call.type==='function_call'){
   let args;try{args=JSON.parse(call.arguments)}catch{}
   trace.push({kind:'tool-call',name:allowed.has(call.name)?call.name:'other-allowed-tool',colourPatch:args?.changes?.some(c=>c.field==='color')?args.changes.find(c=>c.field==='color').value===null?'null':'positive':'absent'});
  }
  if(body.text.format.name==='conversation_boundary_review'){let r;try{r=JSON.parse(response.outputText)}catch{}trace.push({kind:'review',decision:['allow','clarify'].includes(r?.preferenceDecision)?r.preferenceDecision:'invalid'})}
  save();return response;
 }};
 a.beginTurn();const reply=await runAssistantConversation({syntheticOnly:true,branchId:f.branch,context,messages:[{role:'user',content:prompt}]},provider,await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false}),AbortSignal.timeout(110000));
 const checks={blueStructured:['синее','синий'].includes(reply.context.criteria.dress.color?.toLowerCase()),datesPreserved:reply.context.from===context.from&&reply.context.until===context.until,sizePreserved:reply.context.criteria.dress.size==='140',heightPreserved:reply.context.heightCm===138,notesPreserved:reply.context.notes.includes(context.notes[0]),blueCheaperCard:reply.cards.some(c=>c.item.id===f.id(21)&&c.item.price?.amountMinor==='12000'&&c.item.available)};
 fs.writeFileSync(path.join(dir,'turn-1.json'),JSON.stringify({prompt,reply,checks},null,2));return{turns:1,checks,syntheticOnly:true,databaseWrites:0};
};
