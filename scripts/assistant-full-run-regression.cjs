const assert=require('node:assert/strict'),Module=require('node:module');
const load=Module._load;Module._load=function(k,...a){if(/^(?:node:)?(?:https?|net|tls)$/.test(k))throw Error('NETWORK_FORBIDDEN');return load.call(this,k,...a)};
const {testFixture:f}=require('./assistant-small-smoke-fixture.cjs');
const {runAssistantConversation}=require('../lib/assistant/chat/consultation.ts');
const {createCrmTools}=require('../lib/assistant/chat/tools.ts');
const {emptyOutfit}=require('../lib/assistant/chat/outfit-contracts.ts');
const base=()=>{const c=emptyOutfit();Object.assign(c,{from:new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T12:00',until:new Date(Date.now()+8*86400000).toISOString().slice(0,10)+'T18:00',heightCm:138,notes:['Не люблю объёмные платья.'],recentCards:[{variantId:f.id(20),productId:f.id(10),executionId:null,slot:'dress'}]});c.criteria.dress={size:'140',color:'Белый',categoryId:f.category};return c};
const wire=value=>({status:'completed',output:[],outputTokens:50,outputText:JSON.stringify(value)});
const answer=extra=>wire({message:'Учла пожелания.',preferenceChanges:[],cardIds:[],productRefs:[],factRefs:[],...extra});
const call=(name,args)=>({...wire({}),output:[{type:'function_call',name,call_id:name,arguments:JSON.stringify(args)}]});
async function run(prompt,steps,extra={},review={safeSentenceIds:[0],preferenceDecision:'allow',reason:'all_safe'}){let n=0;const result=await runAssistantConversation({syntheticOnly:true,branchId:f.branch,context:base(),messages:[{role:'user',content:prompt}],...extra},{create:async b=>{if(b.text.format.name==='conversation_boundary_review')return review.__response ?? wire(review);assert(n<steps.length,'no extra model call');const step=steps[n++];return typeof step==='function'?step():step}},await createCrmTools({organizationId:f.id(1),allowedBranchIds:[f.branch],hasOrganizationWideBranchAccess:false}),new AbortController().signal);assert.equal(n,steps.length);return result}
(async()=>{
 const booking=await run('Это уже точно забронировано? Подтверди бронь.',[]);assert(booking.message.includes('не могу'));assert(booking.message.includes('не означает бронирование'));assert.equal(booking.cards.length,0);
 const mixed=await run('Как проходит аренда? Бронь уже подтверждена?',[answer({message:'Я не могу подтвердить бронь.'})]);assert(mixed.message.includes('не могу'),'mixed requests still reach the consultation');
 const handoff=await run('Хочу обсудить это с человеком. Подготовь обращение, но не отправляй.',[]);assert(handoff.message.includes('не отправлен'));assert(handoff.message.includes('заявка не создана'));assert(handoff.message.includes('138'));assert(handoff.message.includes('140'));assert(handoff.message.includes(base().from));assert(handoff.message.length<=700);
 const mixedDraft=await run('Размер 146. Подготовь обращение, но не отправляй.',[answer({message:'Уточнение размера сохранено.',preferenceChanges:[{field:'size',slot:'dress',value:'146',quote:'Размер 146'}]})]);assert.equal(mixedDraft.context.criteria.dress.size,'146');assert(!mixedDraft.message.includes('140'));assert(mixedDraft.message.includes('146'));assert(mixedDraft.message.includes('не отправлен'));
 const stale=await run('Теперь подбери синее, параметры прежние.',[call('read_variant',{variantId:f.id(20)}),answer({cardIds:[f.id(20)]})]);assert.equal(stale.cards.length,0);assert.equal(stale.context.criteria.dress.color,'Синий');assert(stale.message.includes('пока не подтверждены'));
 const staleAgain=await run('Покажи подходящий вариант по этим условиям.',[call('read_variant',{variantId:f.id(20)}),answer({cardIds:[f.id(20)]})],{context:stale.context});assert.equal(staleAgain.cards.length,0,'reference cannot resurrect across turns');
 const color={field:'color',slot:'dress',value:'синее',quote:'синее'};
 const cheaper=await run('Лучше синее, остальные пожелания и даты те же. Есть вариант дешевле первого?',[call('remember_preferences',{changes:[color]}),call('read_variant',{variantId:f.id(20)}),answer({preferenceChanges:[color],cardIds:[f.id(20)]})]);assert.equal(cheaper.cards.length,1);assert.equal(cheaper.cards[0].item.id,f.id(21));assert.equal(cheaper.cards[0].item.price.amountMinor,'12000');assert.equal(cheaper.context.recentCards[0].variantId,f.id(21));
 // A failed turn must not poison a later successful current-turn read.
 const catalogBeforeRecovery=f.service.publicCatalog;
 let failedRecoveryReads=0;
 f.service.publicCatalog=async()=>{failedRecoveryReads++;throw Error('synthetic temporary failure')};
 const recoveryContext=base();
 const failedRecovery=await run('Покажи варианты по сохранённым условиям.',[call('find_dresses',{slot:'dress'}),answer({})],{context:recoveryContext});
 assert.equal(failedRecoveryReads,1);
 assert.equal(failedRecovery.cards.length,0);
 f.service.publicCatalog=catalogBeforeRecovery;
 const recovered=await run('Попробуй ещё раз по тем же условиям.',[call('find_dresses',{slot:'dress'}),answer({cardIds:[f.id(20)]})],{context:failedRecovery.context},{safeSentenceIds:[],preferenceDecision:'allow',reason:'unsafe_prose'});
 assert.equal(recovered.cards.length,1);
 assert.equal(recovered.cards[0].item.id,f.id(20));
 assert.equal(recovered.context.from,recoveryContext.from);
 assert.equal(recovered.context.until,recoveryContext.until);
 assert.equal(recovered.context.heightCm,138);
 assert.deepEqual(recovered.context.criteria,recoveryContext.criteria);
 const {clarification}=require('../lib/assistant/chat/verified-reply.ts');
 assert.notEqual(recovered.message,clarification,'verified recovery survives rejected prose');
 // An unavailable verdict exposes only verified saved-criteria data, never model prose.
 const malformedRecovery=await run('Попробуй ещё раз по тем же условиям.',[call('find_dresses',{slot:'dress'}),answer({cardIds:[f.id(20)]})],{context:failedRecovery.context},{malformed:true});
 assert.notEqual(malformedRecovery.message,clarification);
 assert.equal(malformedRecovery.cards.length,1);
 assert.deepEqual(malformedRecovery.context.criteria,recoveryContext.criteria);
 for (const badReview of [
   {__response:{status:'completed',output:[],outputTokens:20,outputText:'{"safeSentenceIds":['}},
   {__response:{status:'incomplete',output:[],outputTokens:300,outputText:'{}'}},
   {__response:{status:'completed',output:[],outputTokens:301,outputText:'{}'}},
 ]) {
   const r=await run('Покажи варианты.',[call('find_dresses',{slot:'dress'}),answer({message:'Бронь подтверждена.',cardIds:[f.id(20)]})],{context:recoveryContext},badReview);
   assert.equal(r.cards.length,1);
   assert(!r.message.includes('Бронь подтверждена'));
   assert(r.message.includes('последнему уточнению не подтверждено'));
   assert.deepEqual(r.context.criteria,recoveryContext.criteria);
 }
 const negativeReview=await run('Покажи варианты.',[call('find_dresses',{slot:'dress'}),answer({cardIds:[f.id(20)]})],{context:recoveryContext},{safeSentenceIds:[],preferenceDecision:'clarify',reason:'unsupported_preferences'});
 assert.equal(negativeReview.cards.length,0);
 assert.equal(negativeReview.recoveryReason,'preference_not_confirmed');
 const unreviewedPatch={field:'size',slot:'dress',value:'140',quote:'размер 140'};
 const blockedPatch=await run('Нужен размер 140.',[call('find_dresses',{slot:'dress'}),answer({cardIds:[f.id(20)],preferenceChanges:[unreviewedPatch]})],{context:recoveryContext},{malformed:true});
 assert.equal(blockedPatch.cards.length,0,'unreviewed model preference edits do not authorize fallback');
 const failedCatalog=f.service.publicCatalog;
 f.service.publicCatalog=async()=>{throw Error('synthetic unavailable')};
 const failedAndMalformed=await run('Покажи варианты.',[call('find_dresses',{slot:'dress'}),answer({})],{context:recoveryContext},{malformed:true});
 assert.equal(failedAndMalformed.cards.length,0);
 assert.equal(failedAndMalformed.recoveryReason,'tool_unavailable');
 f.service.publicCatalog=async()=>({items:[],more:false});
 const emptyAndMalformed=await run('Покажи варианты.',[call('find_dresses',{slot:'dress'}),answer({})],{context:recoveryContext},{malformed:true});
 assert(emptyAndMalformed.message.includes('В проверенной порции по этим условиям вариантов нет'));
 f.service.publicCatalog=failedCatalog;
 const before=f.reads.length;
 const emptyCheaper=await run('Бюджет стал меньше. Покажи дешевле первого без смены размера и дат.',[call('find_cheaper',{slot:'dress',referenceVariantId:f.id(20)}),answer({})],{}, {safeSentenceIds:[],preferenceDecision:'allow',reason:'unsafe_prose'});assert(emptyCheaper.message.includes('не найдено'));assert.equal(emptyCheaper.cards.length,0);assert.equal(f.reads.length-before,1,'successful search is not repeated');
 const old=f.service.publicCatalog;f.service.publicCatalog=async()=>({items:[],more:false,appliedColor:'Синий'});
 const empty=await run('А синее на те же даты есть?',[call('find_dresses',{slot:'dress'}),answer({})]);assert(empty.message.includes('нет вариантов'));assert.equal(empty.context.criteria.dress.color,'Синий');f.service.publicCatalog=old;
 for(const [prompt,size] of [['Размер 146 и синее платье, даты прежние.','146'],['Теперь подбери синее, параметры прежние.','140']]){const r=await run(prompt,[answer({})],{}, {malformed:true});assert.equal(r.context.criteria.dress.color,'Синий');assert.equal(r.context.criteria.dress.size,size);assert.equal(r.cards.length,0)}
 const refs=[{productId:f.id(10),executionId:null},{productId:f.id(11),executionId:null}];
 const malformedComparison=await run('Сравни сохранённые товары.',[call('read_batch',{requests:refs.map(r=>({name:'get_product',productId:r.productId,executionId:''}))}),answer({message:'Бронь подтверждена.',productRefs:refs})],{products:refs},{malformed:true});
 assert.equal(malformedComparison.comparisons.length,2);
 assert(!malformedComparison.message.includes('Бронь подтверждена'));
 assert(malformedComparison.message.includes('по сохранённым условиям'));
 const originalProduct=f.service.publicProduct;let productAttempts=0;
 const failedVerification=await run('Какой вариант дешевле?',[call('read_variant',{variantId:f.id(20)}),()=>{f.service.publicProduct=async()=>{productAttempts++;throw Error('synthetic unavailable')};return answer({cardIds:[f.id(20),f.id(20)]})}],{products:refs});assert.equal(productAttempts,1,'failed verification is not repeated by duplicate cards or comparison fallback');assert.equal(failedVerification.cards.length,0);f.service.publicProduct=originalProduct;
 const {comparedPriceSummary}=require('../lib/assistant/chat/grounded-outcomes.ts');
 const details=await Promise.all(refs.map(r=>f.service.publicProduct(r)));
 assert(comparedPriceSummary(details,'140').includes('№2'));
 const unknown=structuredClone(details);unknown[1].options[0].price=null;assert(comparedPriceSummary(unknown,'140').includes('пока нельзя'));
 const currency=structuredClone(details);currency[1].options[0].price.currency='USD';assert(comparedPriceSummary(currency,'140').includes('пока нельзя'));
 let attempts=0;f.service.publicCatalog=async()=>{attempts++;throw Error('synthetic unavailable')};
 const failed=await run('Есть вариант дешевле первого?',[call('find_cheaper',{referenceVariantId:f.id(20),slot:'dress'}),answer({})]);assert.equal(attempts,1);assert.equal(failed.recoveryReason,'tool_unavailable');assert.equal(failed.cards.length,0);f.service.publicCatalog=old;
 const compared=await run('Сравни два выбранных платья по данным каталога.',[call('read_batch',{requests:refs.map(r=>({name:'get_product',productId:r.productId,executionId:''}))}),answer({productRefs:refs})],{products:refs},{safeSentenceIds:[],preferenceDecision:'allow',reason:'unsafe_prose'});assert.equal(compared.comparisons.length,2);assert.equal(compared.context.recentCards.length,2);assert(!compared.message.includes('Не удалось'));
 const continued=await run('Какой вариант дешевле? Размер и даты прежние.',[call('find_cheaper',{slot:'dress',referenceVariantId:f.id(99)}),answer({message:'Уточните, какие платья.'})],{products:refs,context:compared.context});assert.equal(continued.comparisons.length,2);assert(continued.message.includes('№2'));assert(!continued.message.includes('Уточните'));
 const excluded={field:'color',slot:'dress',value:null,quote:'Розовое не хочу'};
 const negative=await run('Розовое не хочу. Остальные параметры прежние.',[call('remember_preferences',{changes:[excluded]}),answer({preferenceChanges:[excluded]})]);assert.equal(negative.context.criteria.dress.color,'Белый');assert(negative.context.notes.includes('Розовое не хочу'));
 await assert.rejects(()=>run('Покажи платье',[answer({cardIds:[f.id(99)]})]),/Карточка не подтверждена CRM/);
 console.log(JSON.stringify({status:'OFFLINE_PASS',networkCalls:0,checks:['next-turn-recovery-retains-context','recovery-with-rejected-prose-shows-verified-card','unavailable-review-verified-data-only','booking-limitation','unsent-handoff','cheaper-after-reference-only-read','empty-cheaper-no-duplicate-read','empty-catalog-explained','malformed-review-keeps-explicit-preferences','comparison-continuity','different-excluded-color-preserves-filter','unknown-ID-rejected']}));
})().catch(e=>{console.error(e);process.exitCode=1});
