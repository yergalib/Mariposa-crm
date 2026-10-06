import "server-only";
import {z} from "zod";
import type {AuthContext} from "@/lib/auth/session";
import {FinancialTransactionKind,type Prisma} from "@/generated/prisma/client";
import {db} from "@/lib/db";
import {workflowScope} from "@/lib/workflow-access";
import {financeReadVisibility} from "./read-visibility";
export const FINANCE_FILTER_KEYS=["from","until","branchId","kind","paymentMethodId","actorMembershipId","orderId","customerId"] as const;
export type FinanceRawFilters=Partial<Record<typeof FINANCE_FILTER_KEYS[number],string>>;
const DAY=86400000;
export function financePeriod(raw:FinanceRawFilters,now=new Date()){
 const parse=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error("Некорректная дата.");const date=new Date(`${value}T00:00:00Z`);if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error("Некорректная дата.");return date;};
 if(Boolean(raw.from)!==Boolean(raw.until))throw Error("Укажите обе даты периода.");
 const today=new Date(now.toISOString().slice(0,10)+"T00:00:00Z"),from=raw.from?parse(raw.from):new Date(today.getTime()-29*DAY),until=raw.until?parse(raw.until):today,endExclusive=new Date(until.getTime()+DAY);
 if(until<from||endExclusive.getTime()-from.getTime()>366*DAY)throw Error("Период должен быть от 1 до 366 дней.");
 return{from,endExclusive,fromLabel:from.toISOString().slice(0,10),untilLabel:until.toISOString().slice(0,10)};
}
export async function financeQueryScope(actor:AuthContext,raw:FinanceRawFilters={},permission:"FINANCE_DASHBOARD_VIEW"|"REPORT_FINANCE_VIEW"="FINANCE_DASHBOARD_VIEW"){
 const filters={...raw};for(const key of ["branchId","paymentMethodId","actorMembershipId","orderId","customerId"] as const){if(filters[key]&&!z.string().uuid().safeParse(filters[key]).success)throw Error("Некорректный фильтр финансов.");if(!filters[key])delete filters[key];}
 if(filters.kind&&!Object.values(FinancialTransactionKind).includes(filters.kind as FinancialTransactionKind))throw Error("Некорректный тип операции.");
 const access=await db.$transaction(tx=>workflowScope(tx,actor,[permission],filters.branchId));
 if(!["OWNER","DIRECTOR"].includes(access.member.role))throw Error("Общая финансовая сводка доступна владельцу и директору.");
 const visibility=await financeReadVisibility({...actor,role:access.member.role}),period=financePeriod(filters);
 const where:Prisma.FinancialTransactionWhereInput={AND:[access.where,visibility.where,{occurredAt:{gte:period.from,lt:period.endExclusive},branchId:filters.branchId,paymentMethodId:filters.paymentMethodId,actorMembershipId:filters.actorMembershipId,orderId:filters.orderId,customerId:filters.customerId},...(filters.kind?[{OR:[{kind:filters.kind as FinancialTransactionKind},...(filters.kind!=="REVERSAL"?[{kind:"REVERSAL" as const,reversalOf:{kind:filters.kind as FinancialTransactionKind}}]:[])]}]:[])]};
 return{where,visibility,period,scope:access.where,filters};
}
export async function financeFilterOptions(actor:AuthContext,permission:"FINANCE_DASHBOARD_VIEW"|"REPORT_FINANCE_VIEW"="FINANCE_DASHBOARD_VIEW"){const {scope}=await financeQueryScope(actor,{},permission);const [branches,methods,members]=await Promise.all([db.branch.findMany({where:{organizationId:actor.organizationId,status:"ACTIVE",id:scope.branchId},select:{id:true,name:true},orderBy:{name:"asc"}}),db.paymentMethod.findMany({where:{organizationId:actor.organizationId},select:{id:true,displayName:true,isActive:true},orderBy:{displayName:"asc"}}),db.organizationMembership.findMany({where:{organizationId:actor.organizationId,...(scope.branchId?{OR:[{role:"OWNER" as const},{branchAccess:{some:{branchId:scope.branchId}}}]}:{})},select:{id:true,user:{select:{displayName:true}}},orderBy:{user:{displayName:"asc"}}})]);return{branches,methods,members};}
