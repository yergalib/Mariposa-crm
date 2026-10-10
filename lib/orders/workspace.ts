import "server-only";
import {OrderStatus,Prisma} from "@/generated/prisma/client";
import {db} from "@/lib/db";
import {workflowScope,type WorkflowActor} from "@/lib/workflow-access";
import {readOrderListFilters,orderRentalPeriodWhere} from "./list-filters";
import {deriveOrderPaymentDisplayStatus} from "@/lib/finance/payment-status";
import { BOARD_PAGE_SIZE, todayOrderWhere, workspacePage } from "./workspace-quick";
export type WorkspaceFilters=ReturnType<typeof readOrderListFilters>;
export async function workspaceOrderWhere(actor:WorkflowActor,filters:WorkspaceFilters,now=new Date()){
 const {where}=await db.$transaction(tx=>workflowScope(tx,actor,["ORDER_VIEW",...((filters.payment||filters.quick==="debt")?["PAYMENT_VIEW" as const]:[])],filters.branchId));
 const q=filters.search;
 const result:Prisma.OrderWhereInput={...where,status:filters.status,type:filters.type,channel:filters.source,branchId:filters.branchId??where.branchId,customerId:filters.customerId,assignedMembershipId:filters.assignedMembershipId==="UNASSIGNED"?null:filters.assignedMembershipId,...orderRentalPeriodWhere(filters),...(q?{OR:[{orderNumber:{contains:q,mode:"insensitive"}},{customer:{OR:[{firstName:{contains:q,mode:"insensitive"}},{lastName:{contains:q,mode:"insensitive"}},{contacts:{some:{value:{contains:q,mode:"insensitive"}}}}]}}]}:{})};
 const and:Prisma.OrderWhereInput[]=[];
 if(filters.quick==="mine")and.push({assignedMembershipId:actor.membershipId});
 if(filters.quick==="pickups"||filters.quick==="returns"){
 const branches=await db.branch.findMany({where:{organizationId:actor.organizationId,id:filters.branchId??where.branchId},select:{id:true,timezone:true}});
 and.push(todayOrderWhere(filters.quick,branches,now));
 }
 if(filters.overdue||filters.quick==="overdue"||filters.quick==="returns"){
 const ids=await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT o.id FROM orders o WHERE o.organization_id=${actor.organizationId}::uuid AND o.type='RENTAL' ${filters.overdue||filters.quick==="overdue"?Prisma.sql`AND o.rental_end_at < ${now}`:Prisma.empty} AND o.status NOT IN ('CANCELLED','COMPLETED') AND (SELECT COALESCE(sum(a.issued_quantity-a.returned_quantity),0) FROM capacity_allocations a WHERE a.order_id=o.id AND a.organization_id=o.organization_id AND a.source_type='ORDER') > (SELECT COALESCE(sum(r.total_quantity),0) FROM bulk_physical_resolutions r WHERE r.order_id=o.id AND r.organization_id=o.organization_id AND r.kind='LOSS_RESOLUTION')`);
 and.push({id:{in:ids.map(row=>row.id)}});
 }
 if(and.length)result.AND=and;
 if(filters.payment||filters.quick==="debt"){
 const candidates=await db.order.findMany({where:result,select:{id:true,totalMinor:true},take:10001});if(candidates.length>10000)throw new Error("Для фильтра оплаты уточните период или филиал: более 10000 заказов.");
 const selected:string[]=[];
 for(let index=0;index<candidates.length;index+=1000){const chunk=candidates.slice(index,index+1000),rows=await db.financialTransaction.groupBy({by:["orderId"],where:{organizationId:actor.organizationId,orderId:{in:chunk.map(row=>row.id)}},_sum:{obligationEffectMinor:true,revenueEffectMinor:true}}),byId=new Map(rows.map(row=>[row.orderId,row._sum]));for(const order of chunk){const sum=byId.get(order.id),obligation=sum?.obligationEffectMinor??BigInt(0),revenue=sum?.revenueEffectMinor??BigInt(0);if((filters.quick!=="debt"||obligation>BigInt(0))&&(!filters.payment||deriveOrderPaymentDisplayStatus({orderTotalMinor:order.totalMinor,totalChargedMinor:revenue,paidMinor:revenue-obligation,outstandingMinor:obligation})===filters.payment))selected.push(order.id);}}
 and.push({id:{in:selected}});result.AND=and;
 }
 return result;
}
export function orderWorkspaceSort(sort?:string):Prisma.OrderOrderByWithRelationInput[]{return sort==="created_asc"?[{createdAt:"asc"},{id:"asc"}]:sort==="rental_start"?[{rentalStartAt:{sort:"asc",nulls:"last"}},{id:"asc"}]:sort==="number"?[{orderNumber:"asc"},{id:"asc"}]:[{createdAt:"desc"},{id:"desc"}];}
const orderInclude = {customer:{include:{contacts:{where:{type:"PHONE" as const},take:1}}},branch:true,assignedTo:{select:{user:{select:{displayName:true}}}},_count:{select:{items:{where:{removedAt:null}}}}} satisfies Prisma.OrderInclude;
export async function listOrdersWorkspace(actor:WorkflowActor,filters:WorkspaceFilters,page=1,boardPages?:Record<string,unknown>){
 const where=await workspaceOrderWhere(actor,filters);
 page=workspacePage(page);
 const counts=await db.order.groupBy({by:["status"],where,_count:{_all:true}});
 const statusCounts=Object.fromEntries(counts.map(row=>[row.status,row._count._all]));
 const total=counts.reduce((sum,row)=>sum+row._count._all,0);
 const pages=Math.max(1,Math.ceil(total/50));
 page=Math.min(page,pages);
 const columns=boardPages ? await Promise.all(Object.values(OrderStatus).filter(status=>filters.status?filters.status===status:(statusCounts[status]??0)>0).map(async status=>{
   const count=statusCounts[status]??0,pages=Math.max(1,Math.ceil(count/BOARD_PAGE_SIZE));
   const page=Math.min(workspacePage(boardPages[status]),pages);
   const rows=count?await db.order.findMany({where:{AND:[where,{status}]},include:orderInclude,orderBy:orderWorkspaceSort(filters.sort),skip:(page-1)*BOARD_PAGE_SIZE,take:BOARD_PAGE_SIZE}):[];
   return {status,total:count,page,pages,rows};
 })) : [];
 const rows=boardPages?columns.flatMap(column=>column.rows):await db.order.findMany({where,include:orderInclude,orderBy:orderWorkspaceSort(filters.sort),skip:(page-1)*50,take:50});
 return{rows,total,page,pages,statusCounts,columns};
}
export async function workspaceAssignees(actor:WorkflowActor){const {where}=await db.$transaction(tx=>workflowScope(tx,actor,["ORDER_VIEW"]));return db.organizationMembership.findMany({where:{organizationId:actor.organizationId,...(where.branchId?{OR:[{role:"OWNER" as const},{branchAccess:{some:{branchId:where.branchId}}}]}:{})},select:{id:true,status:true,user:{select:{displayName:true}}},orderBy:{user:{displayName:"asc"}}});}
