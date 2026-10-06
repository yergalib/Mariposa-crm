import "server-only";
import {db} from "@/lib/db";
import type {AuthContext} from "@/lib/auth/session";
import type {TenantContext} from "@/lib/tenant/context";
import {visibleFinanceEffects} from "./read-visibility";
import {financeQueryScope,type FinanceRawFilters} from "./filters";
const RECENT_LIMIT=50;
export async function getFinanceDashboard(tenant:TenantContext,actor:AuthContext,filters:FinanceRawFilters={},requestedPage=1){
 if(tenant.organizationId!==actor.organizationId)throw Error("Финансовый объект недоступен.");
 const {where,visibility,period}=await financeQueryScope(actor,filters),page=Number.isSafeInteger(requestedPage)?Math.max(1,Math.min(requestedPage,100000)):1;
 const [totals,recent,total]=visibility.hasRows?await Promise.all([
 db.financialTransaction.groupBy({by:["currency"],where,_sum:visibility.fields,_count:{_all:true},orderBy:{currency:"asc"}}),
 db.financialTransaction.findMany({where,orderBy:[{occurredAt:"desc"},{id:"desc"}],take:RECENT_LIMIT,skip:(page-1)*RECENT_LIMIT,select:{id:true,kind:true,occurredAt:true,currency:true,amountMinor:true,orderId:true,customerId:true,reason:true,...visibility.fields,reversal:{select:{id:true}},order:{select:{orderNumber:true}},customer:{select:{firstName:true,lastName:true}},actorUser:{select:{displayName:true}},branch:{select:{name:true,timezone:true}},paymentMethod:{select:{displayName:true}}}}),db.financialTransaction.count({where})]):[[],[],0];
 return{totals:totals.map(row=>({currency:row.currency,_count:row._count,_sum:visibleFinanceEffects(row._sum,visibility)})),recent:recent.map(row=>{const {revenueEffectMinor,cashEffectMinor,depositEffectMinor,obligationEffectMinor,...rest}=row;return{...rest,...visibleFinanceEffects({revenueEffectMinor,cashEffectMinor,depositEffectMinor,obligationEffectMinor},visibility)}}),period,page,total,pages:Math.max(1,Math.ceil(total/RECENT_LIMIT)),windowDays:Math.round((period.endExclusive.getTime()-period.from.getTime())/86400000),recentLimit:RECENT_LIMIT,hasVisibleKinds:visibility.hasRows};
}
