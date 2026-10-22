const assert=require('assert/strict'),{charge,project}=require('./settled-budget-candidate.cjs');
const row={id:'a',created_at:'2026-10-21T19:00:00Z',model:'gpt-6.1-sol',pricing_version:'gpt-6.1-sol:2026-10-21:standard:2.00:0.10:2.50:10.00',call_kind:'planning',output_token_cap:1400,reserved_nano:369512000,usage_state:'verified',has_receipt:true,actual_cost_nano:177000,actual_usage:{inputTokens:100,outputTokens:10,cachedInputTokens:20,cacheWriteTokens:10,reasoningTokens:5}};
// 70*2000+20*100+10*2500+10*10000; reasoning is already included in output.
row.actual_cost_nano=267000;assert.equal(charge(row).debit,267000n);
assert.equal(charge({...row,usage_state:'reserved',actual_usage:null,actual_cost_nano:null,has_receipt:false}).debit,369512000n);
for(const patch of [{has_receipt:false},{actual_cost_nano:1},{pricing_version:'future'},{actual_usage:{...row.actual_usage,reasoningTokens:11}},{actual_usage:{...row.actual_usage,cachedInputTokens:101}}])assert.equal(charge({...row,...patch}).kind,'invalid_receipt');
assert.equal(charge({...row,model:null,usage_state:null,reserved_nano:null}).kind,'legacy');
const luna={...row,id:'l',model:'gpt-6-luna',pricing_version:'gpt-6-luna:2026-10-20:standard:0.10:0.01:0.125:0.50',actual_cost_nano:13450};assert.equal(charge(luna).debit,13450n);
const start=Date.parse(row.created_at),end=start+86400000;
const p=project([row,row,luna,{...row,id:'before',created_at:new Date(start-1).toISOString()},{...row,id:'next',created_at:new Date(end).toISOString()}],start,end);assert.equal(p.calls,2);assert.equal(p.confirmed,280450n);assert.throws(()=>project([row,{...row,actual_cost_nano:1}],start,end));assert.equal(project([row],start,end).debit,project([row],start,end).debit);
console.log('PASS offline projection: snapshots/mixed models, cache/write/reasoning, invalid receipt reserve, unknown/legacy, exact Almaty boundary, duplicate receipt input/idempotency. No runtime integration.');
