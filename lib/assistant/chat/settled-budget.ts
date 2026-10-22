import { ledgerPrice } from './ledger-pricing';
export type SettlementReceipt={model:string;pricingVersion:string;kind:string;outputCap:number;reserve:string;cost:string;responseId:string;usage:Record<string,number>};
// Only a projection: immutable reservation/receipt rows are never changed here.
export function settledDailyDebit(reservations:bigint,receipts:SettlementReceipt[]):bigint{
 let debit=reservations;const seen=new Set<string>();
 for(const r of receipts){
  if(!r||!/^resp_[A-Za-z0-9_-]{1,180}$/.test(r.responseId)||seen.has(r.responseId)||!['planning','review','smoke'].includes(r.kind)||!/^\d+$/.test(r.reserve)||!/^\d+$/.test(r.cost))throw Error('Invalid settlement receipt');
  seen.add(r.responseId);const u=r.usage,p=ledgerPrice(r.pricingVersion,r.model),reserve=BigInt(r.reserve),stored=BigInt(r.cost);
  for(const k of ['inputTokens','outputTokens','cachedInputTokens','cacheWriteTokens','reasoningTokens'])if(!Number.isSafeInteger(u?.[k])||u[k]<0)throw Error('Invalid settlement usage');
  if(u.inputTokens<1||u.inputTokens>128768||!Number.isSafeInteger(r.outputCap)||r.outputCap<1||r.outputCap>1400||u.outputTokens>r.outputCap||u.cachedInputTokens+u.cacheWriteTokens>u.inputTokens||u.reasoningTokens>u.outputTokens)throw Error('Invalid settlement bounds');
  const cost=BigInt(u.inputTokens-u.cachedInputTokens-u.cacheWriteTokens)*BigInt(p.input)+BigInt(u.cachedInputTokens)*BigInt(p.cached)+BigInt(u.cacheWriteTokens)*BigInt(p.write)+BigInt(u.outputTokens)*BigInt(p.output);
  if(cost!==stored||cost>reserve||reserve<=BigInt(0))throw Error('Invalid settlement cost');
  debit-=reserve-cost;
 }
 if(debit<BigInt(0))throw Error('Invalid settlement total');return debit;
}
