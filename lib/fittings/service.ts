import "server-only";
import {createHash} from "node:crypto";
import {Prisma} from "@/generated/prisma/client";
import {db} from "@/lib/db";
import {appendAuditLog} from "@/lib/audit/log";
import {workflowScope,validateWorkflowAssignee,permits,type WorkflowActor} from "@/lib/workflow-access";
import {createFittingInput,updateFittingInput,fittingStatus} from "./validation";
import {z} from "zod";
type Input=z.infer<typeof createFittingInput>;
const include={branch:{select:{name:true,timezone:true}},customer:{select:{id:true,firstName:true,lastName:true}},assignedTo:{select:{id:true,user:{select:{displayName:true}}}},items:true} as const;
async function lockEmployee(tx:Prisma.TransactionClient,org:string,id:string){await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`fitting:${org}:${id}`},0))`);}
async function validate(tx:Prisma.TransactionClient,actor:WorkflowActor,input:Omit<Input,"creationKey">,previous?:{customerId:string|null;inquiryId:string|null;items:{organizationId:string;productVariantId:string;nameSnapshot:string;skuSnapshot:string;sizeSnapshot:string}[]}){
 const {member}=await workflowScope(tx,actor,["FITTING_VIEW","FITTING_MANAGE"],input.branchId);
 if(input.assignedMembershipId!==actor.membershipId&&!permits(member,"FITTING_ASSIGN"))throw new Error("Нет права назначать примерку другому сотруднику.");
 await validateWorkflowAssignee(tx,actor,input.branchId,input.assignedMembershipId,["FITTING_VIEW","FITTING_MANAGE"]);
 if(input.customerId&&input.customerId!==previous?.customerId){if(!permits(member,"CUSTOMER_VIEW")||!await tx.customer.findFirst({where:{id:input.customerId,organizationId:actor.organizationId,status:{not:"ARCHIVED"}},select:{id:true}}))throw new Error("Клиент недоступен.");}
 if(input.inquiryId&&input.inquiryId!==previous?.inquiryId){if(!permits(member,"LEAD_VIEW")||!permits(member,"LEAD_EDIT")||!await tx.inquiry.findFirst({where:{id:input.inquiryId,organizationId:actor.organizationId,branchId:input.branchId,status:{not:"CLOSED"}},select:{id:true}}))throw new Error("Обращение недоступно.");}
 const retained=new Map((previous?.items??[]).map(item=>[item.productVariantId,{organizationId:item.organizationId,productVariantId:item.productVariantId,nameSnapshot:item.nameSnapshot,skuSnapshot:item.skuSnapshot,sizeSnapshot:item.sizeSnapshot}]));const added=input.variantIds.filter(id=>!retained.has(id));
 if(added.length&&!permits(member,"CATALOG_VIEW"))throw new Error("Нет доступа к подбору товаров.");
 const variants=await tx.productVariant.findMany({where:{id:{in:added},organizationId:actor.organizationId,isActive:true,product:{organizationId:actor.organizationId,publicationStatus:"ACTIVE",archivedAt:null}},select:{id:true,sku:true,product:{select:{name:true}},execution:{select:{name:true}},size:{select:{name:true,code:true}}}});
 if(variants.length!==added.length)throw new Error("Один из выбранных товаров недоступен.");
 return [...input.variantIds.flatMap(id=>retained.has(id)?[retained.get(id)!]:[]),...variants.map(v=>({organizationId:actor.organizationId,productVariantId:v.id,nameSnapshot:`${v.product.name}${v.execution?` · ${v.execution.name}`:""}`,skuSnapshot:v.sku,sizeSnapshot:v.size.name||v.size.code}))];
}
async function assertSlot(tx:Prisma.TransactionClient,actor:WorkflowActor,input:Omit<Input,"creationKey">,excludeId?:string){
 const endsAt=new Date(input.startsAt.getTime()+30*60*1000);
 if(await tx.fitting.findFirst({where:{organizationId:actor.organizationId,assignedMembershipId:input.assignedMembershipId,id:excludeId?{not:excludeId}:undefined,status:{in:["SCHEDULED","ARRIVED","COMPLETED"]},startsAt:{lt:endsAt},endsAt:{gt:input.startsAt}},select:{id:true}}))throw new Error("У сотрудника уже есть примерка в это время. Выберите другой 30-минутный интервал.");
 return endsAt;
}
function fields(input:Omit<Input,"creationKey">){return{branchId:input.branchId,customerId:input.customerId??null,inquiryId:input.inquiryId??null,guestName:input.guestName||null,guestContact:input.guestContact||null,startsAt:input.startsAt,assignedMembershipId:input.assignedMembershipId,source:input.source,comment:input.comment||null};}
async function audit(tx:Prisma.TransactionClient,actor:WorkflowActor,row:{id:string;branchId:string;assignedMembershipId:string;status:string},action:string){await appendAuditLog(tx,{organizationId:actor.organizationId,branchId:row.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action,entityType:"Fitting",entityId:row.id,metadata:{status:row.status,assignedMembershipId:row.assignedMembershipId}});}
export async function createFitting(actor:WorkflowActor,raw:unknown){const input=createFittingInput.parse(raw),hash=createHash("sha256").update(JSON.stringify(input)).digest("hex");return db.$transaction(async tx=>{
 await workflowScope(tx,actor,["FITTING_VIEW","FITTING_MANAGE"],input.branchId);
 await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`fitting-create:${actor.organizationId}:${input.creationKey}`},0))`);
 const old=await tx.fitting.findUnique({where:{organizationId_creationKey:{organizationId:actor.organizationId,creationKey:input.creationKey}}});
 if(old){if(old.creationHash!==hash||old.createdByUserId!==actor.userId)throw new Error("Повтор запроса отличается от исходного.");return old.id;}
 const items=await validate(tx,actor,input);await lockEmployee(tx,actor.organizationId,input.assignedMembershipId);const endsAt=await assertSlot(tx,actor,input);
 const row=await tx.fitting.create({data:{...fields(input),endsAt,organizationId:actor.organizationId,creationKey:input.creationKey,creationHash:hash,createdByUserId:actor.userId,items:{create:items}}});
 if(input.inquiryId)await tx.inquiry.updateMany({where:{id:input.inquiryId,organizationId:actor.organizationId,orderId:null},data:{status:"FITTING",version:{increment:1}}});
 await audit(tx,actor,row,"FITTING_CREATED");return row.id;
 },{timeout:30000});}
export async function updateFitting(actor:WorkflowActor,raw:unknown){const input=updateFittingInput.parse(raw);return db.$transaction(async tx=>{
 const {where,member}=await workflowScope(tx,actor,["FITTING_VIEW","FITTING_MANAGE"]);
 await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`fitting-row:${actor.organizationId}:${input.id}`},0))`);
 const old=await tx.fitting.findFirst({where:{...where,id:input.id},include:{items:true}});if(!old)throw new Error("Примерка недоступна.");if(old.assignedMembershipId!==actor.membershipId&&!permits(member,"FITTING_ASSIGN"))throw new Error("Нет права менять примерку другого сотрудника.");if(old.version!==input.version)throw new Error("Примерка уже изменена. Обновите страницу.");
 if(["COMPLETED","CANCELLED","NO_SHOW"].includes(old.status))throw new Error("Завершённую примерку нельзя редактировать. Создайте новую запись.");
 if(old.inquiryId!==(input.inquiryId??null)||old.branchId!==input.branchId)throw new Error("Филиал и исходное обращение примерки неизменяемы.");
 if(input.status==="COMPLETED"&&old.status!=="ARRIVED")throw new Error("Сначала отметьте приход клиента.");
 if(input.status==="NO_SHOW"&&old.startsAt>new Date())throw new Error("Неявку можно отметить после начала примерки.");
 if(old.status==="ARRIVED"&&["SCHEDULED","NO_SHOW"].includes(input.status))throw new Error("Приход клиента уже отмечен.");
 if(["CANCELLED","NO_SHOW"].includes(input.status)){if(old.assignedMembershipId!==actor.membershipId&&!permits(member,"FITTING_ASSIGN"))throw new Error("Нет права менять примерку другого сотрудника.");const row=await tx.fitting.update({where:{id:old.id},data:{status:input.status,comment:input.comment||null,version:{increment:1}}});await audit(tx,actor,row,"FITTING_UPDATED");return row.id;}
 const items=await validate(tx,actor,input,old);
 for(const employee of [...new Set([old.assignedMembershipId,input.assignedMembershipId])].sort())await lockEmployee(tx,actor.organizationId,employee);
 const endsAt=["CANCELLED","NO_SHOW"].includes(input.status)?new Date(input.startsAt.getTime()+1800000):await assertSlot(tx,actor,input,input.id);
 const row=await tx.fitting.update({where:{id:old.id},data:{...fields(input),endsAt,status:input.status,version:{increment:1},items:{deleteMany:{},create:items}}});
 await audit(tx,actor,row,"FITTING_UPDATED");return row.id;
 },{timeout:30000});}
export async function getFitting(actor:WorkflowActor,id:string){if(!z.string().uuid().safeParse(id).success)return null;return db.$transaction(async tx=>{const {where}=await workflowScope(tx,actor,["FITTING_VIEW"]);return tx.fitting.findFirst({where:{...where,id},include});});}
export async function listFittings(actor:WorkflowActor,input:{from?:Date;until?:Date;branchId?:string;status?:string;mine?:boolean;page?:number;limit?:number}){return db.$transaction(async tx=>{
 const {where}=await workflowScope(tx,actor,["FITTING_VIEW"],input.branchId),status=fittingStatus.safeParse(input.status),page=Number.isSafeInteger(input.page)?Math.max(1,Math.min(input.page!,10000)):1;
 const limit=input.limit===1000?1000:50;const rows=await tx.fitting.findMany({where:{AND:[where,{branchId:input.branchId,startsAt:{gte:input.from,lt:input.until},status:status.success?status.data:undefined,assignedMembershipId:input.mine?actor.membershipId:undefined}]},include,orderBy:[{startsAt:"asc"},{id:"asc"}],skip:(page-1)*limit,take:limit+1});
 return{rows:rows.slice(0,limit),more:rows.length>limit,page};
});}

export async function fittingHistory(actor:WorkflowActor,id:string){const row=await getFitting(actor,id);if(!row)return[];return db.auditLog.findMany({where:{organizationId:actor.organizationId,entityType:"Fitting",entityId:id},select:{id:true,action:true,occurredAt:true,metadata:true,actorUser:{select:{displayName:true}}},orderBy:{occurredAt:"desc"},take:100});}
