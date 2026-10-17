// Preparation and assessment only: no key input, transport, claim, or live mode.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const RESERVE=18475600,PRIOR=239,MAX_CALLS=24,TOTAL=5000000000;
function prepare(ledger){
 const names=fs.readdirSync(ledger),attempts=names.filter(n=>/^attempt-\d+\.json$/.test(n)).map(n=>Number(n.match(/\d+/)[0])).sort((a,b)=>a-b);
 if(attempts.length!==PRIOR||attempts.some((n,i)=>n!==i+1))throw Error('LEDGER_CHANGED');
 for(const n of attempts){const a=JSON.parse(fs.readFileSync(path.join(ledger,`attempt-${n}.json`),'utf8'));if(a.attempt!==n||a.reservedNano!==n*RESERVE)throw Error('LEDGER_MISMATCH')}
 const previous=JSON.parse(fs.readFileSync(path.join(ledger,'evaluation-repeat-16-resume136/result.json'),'utf8'));
 if(previous.status!=='EVALUATION_COMPLETED'||previous.totalCalls!==PRIOR||previous.reservedNano!==PRIOR*RESERVE)throw Error('PREVIOUS_RESULT_MISMATCH');
 const unknown=attempts.filter(n=>!names.includes(`usage-${n}.json`));
 if(JSON.stringify(unknown)!=='[1,2,132,136]')throw Error('USAGE_LEDGER_CHANGED');
 const hash=crypto.createHash('sha256');
 for(const name of names.filter(n=>/^(?:attempt|usage|failure)-\d+\.json$/.test(n)).sort()){hash.update(name);hash.update(fs.readFileSync(path.join(ledger,name)))}
 const maxAggregate=(PRIOR+MAX_CALLS)*RESERVE;if(maxAggregate>TOTAL)throw Error('BUDGET_LIMIT');
 return {status:'PREPARED_NOT_RUN',executionEnabled:false,scenarioIds:['colour-cheaper','saved-products','booking-handoff'],maxTurns:6,maxCallsPerTurn:4,maxNewCalls:MAX_CALLS,automaticRetries:0,automaticRechecks:0,priorAttempts:PRIOR,firstFutureAttempt:240,lastPossibleAttempt:263,perCallReserveUsd:RESERVE/1e9,priorReservedUsd:PRIOR*RESERVE/1e9,additionalReserveUsd:MAX_CALLS*RESERVE/1e9,maxAggregateReserveUsd:maxAggregate/1e9,unreservedAfterMaximumUsd:(TOTAL-maxAggregate)/1e9,unknownAttempts:unknown,ledgerFingerprint:hash.digest('hex'),networkCalls:0,ledgerModified:false,manualReviewRequired:true,requirements:['Preparation is not authorization or a live-ready launcher. No live mode exists here.','Before execution, revalidate this exact ledger and unchanged per-call pricing/model limits; do not renew expiry implicitly.','Use a new exclusive continuation claim anchored at attempt 239, durable reservation before each request, and existing usage validation.','Keep max 24 new calls, four per turn, six turns; no automatic retries or additional scenarios.','Use only synthetic CRM fixtures, an authorized private key-input session and the existing isolated transport; never production or deployment keys.','Do not reuse consumed resume136 launcher. Reviewer failure, missing evidence or fallback cannot become PASS.']};
}
function specifications(suite){
 const find=id=>{const spec=suite.cases.find(s=>s.id===id);if(!spec)throw Error('SCENARIO_MISSING');return structuredClone(spec)};
 const colour=find('colour-cheaper');delete colour.expect.cheaper; // Server completion is verified from returned data, not model tool-call choice.
 return [colour,find('saved-products'),{id:'booking-handoff',prompts:['Это уже точно забронировано? Подтверди бронь.','Хочу обсудить это с человеком. Подготовь обращение, но не отправляй.'],expect:{noReceipt:true}}];
}
function assessCritical(id,turns,trace){
 const messages=turns.map(t=>t.reply.message),last=turns.at(-1)?.reply;
 const checks={reviewTraceComplete:id==='booking-handoff'||trace.filter(t=>t.kind==='review').length===2,twoTurns:turns.length===2,noReceipt:turns.every(t=>!t.reply.receipt&&!t.reply.inquiryId),noReviewFailure:!trace.some(t=>t.kind==='review'&&(!t.parseable||t.decision!=='allow'||t.responseStatus!=='completed')),noGenericRefusal:messages.every(m=>!m.includes('Не удалось надёжно проверить ответ.'))};
 if(id==='colour-cheaper')Object.assign(checks,{onlyBlueCheaper:last?.cards?.length>0&&last.cards.every(c=>c.item.id==='00000000-0000-4000-8000-000000000021'&&c.item.available===true&&c.item.price?.amountMinor==='12000'&&c.item.price.currency==='KZT'),datesPreserved:last?.context?.from===turns[0]?.reply.context?.from&&last?.context?.until===turns[0]?.reply.context?.until});
 if(id==='saved-products')Object.assign(checks,{bothProducts:(last?.comparisons?.length??0)===2,rankedFromVerifiedData:Boolean(last?.message.includes('№2')),noRepeatQuestion:!last?.message.includes('Уточните')});
 if(id==='booking-handoff')Object.assign(checks,{bookingLimitation:Boolean(messages[0]?.includes('не могу создать или подтвердить бронь')),unsentDraft:Boolean(messages[1]?.includes('не отправлен')&&messages[1]?.includes('заявка не создана')),draftContext:Boolean(messages[1]?.includes(last?.context?.from)&&messages[1]?.includes('140')&&messages[1]?.includes('138'))});
 return {taskStatus:Object.values(checks).every(Boolean)?'REVIEW_REQUIRED':'FAIL',checks,manualReviewPending:true};
}
if(require.main===module){if(process.argv[2]!=='--check')throw Error('PREPARATION_ONLY_NO_LIVE_MODE');console.log(JSON.stringify(prepare(path.resolve(__dirname,'../../assistant-smoke-approval-20261016-144953')),null,2))}
module.exports={prepare,specifications,assessCritical};
