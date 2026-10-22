// LOCAL PROPOSAL ONLY: never imported by application/runtime. No DB writes.
const {ledgerPrice,LEGACY_ALLOWANCE}=require('../lib/assistant/chat/ledger-pricing.ts');
function charge(row){
 const reserve=BigInt(row.reserved_nano??(row.output_token_cap===300?LEGACY_ALLOWANCE.review:LEGACY_ALLOWANCE.planning));
 if(row.usage_state!=='verified')return {debit:reserve,reserve,confirmed:0n,kind:row.model===null?'legacy':'pending_unknown'};
 try{
  if(!row.has_receipt||!row.actual_usage||row.actual_cost_nano===null||!['planning','review','smoke'].includes(row.call_kind))throw Error('receipt incomplete');
  const u=row.actual_usage,p=ledgerPrice(row.pricing_version,row.model);
  for(const n of ['inputTokens','outputTokens','cachedInputTokens','cacheWriteTokens','reasoningTokens'])if(!Number.isSafeInteger(u[n])||u[n]<0)throw Error('invalid tokens');
  if(u.inputTokens<1||u.inputTokens>128768||u.outputTokens>row.output_token_cap||u.cachedInputTokens+u.cacheWriteTokens>u.inputTokens||u.reasoningTokens>u.outputTokens)throw Error('invalid bounds');
  const cost=BigInt(u.inputTokens-u.cachedInputTokens-u.cacheWriteTokens)*BigInt(p.input)+BigInt(u.cachedInputTokens)*BigInt(p.cached)+BigInt(u.cacheWriteTokens)*BigInt(p.write)+BigInt(u.outputTokens)*BigInt(p.output);
  if(cost!==BigInt(row.actual_cost_nano)||cost>reserve)throw Error('cost mismatch');
  return {debit:cost,reserve,confirmed:cost,kind:'verified'};
 }catch{return {debit:reserve,reserve,confirmed:0n,kind:'invalid_receipt'};}
}
function project(rows,start,end){
 const seen=new Map();for(const r of rows){if(seen.has(r.id)&&JSON.stringify(seen.get(r.id))!==JSON.stringify(r))throw Error('conflicting duplicate');seen.set(r.id,r);}
 const out={calls:0,reservations:0n,debit:0n,confirmed:0n,unconfirmed:0n,invalid:0};
 for(const r of seen.values()){const t=Date.parse(r.created_at);if(t<start||t>=end)continue;const c=charge(r);out.calls++;out.reservations+=c.reserve;out.debit+=c.debit;out.confirmed+=c.confirmed;if(c.kind!=='verified')out.unconfirmed+=c.debit;if(c.kind==='invalid_receipt')out.invalid++;}return out;
}
module.exports={charge,project};
if(require.main===module){const rows=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8')),out={all:project(rows,0,Infinity),almatyOct22:project(rows,Date.parse('2026-10-21T19:00Z'),Date.parse('2026-10-22T19:00Z'))};console.log(JSON.stringify(out,(_,v)=>typeof v==='bigint'?v.toString():v,2));}
