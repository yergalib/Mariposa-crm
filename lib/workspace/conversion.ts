import {permissionMemberSelect} from "@/lib/permissions/member";
import {createTenantContext} from "@/lib/tenant/context";
import "server-only";
import {z} from "zod";
import {Prisma} from "@/generated/prisma/client";
import {db} from "@/lib/db";
import {appendAuditLog} from "@/lib/audit/log";
import {createOrder} from "@/lib/orders/management";
import {workflowScope,validateWorkflowAssignee,permits,type WorkflowActor} from "@/lib/workflow-access";
const uuid=z.string().uuid();
const conversion=z.object({source:z.enum(["INQUIRY","FITTING"]),sourceId:uuid,customerId:uuid,rentalStart:z.date(),rentalEnd:z.date(),assignedMembershipId:uuid.nullable().optional()}).refine(v=>v.rentalEnd>v.rentalStart,{message:"Проверьте период аренды."});
export async function convertToRentalOrder(actor:WorkflowActor,raw:unknown){const input=conversion.parse(raw);return db.$transaction(async tx=>{
 const {member,where}=await workflowScope(tx,actor,["ORDER_CREATE","ORDER_VIEW",input.source==="INQUIRY"?"LEAD_CONVERT_TO_ORDER":"FITTING_MANAGE",input.source==="INQUIRY"?"LEAD_VIEW":"FITTING_VIEW"]);
 await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`conversion:${actor.organizationId}:${input.source}:${input.sourceId}`},0))`);
 if(input.source==="FITTING")await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`fitting-row:${actor.organizationId}:${input.sourceId}`},0))`);
 const fitting=input.source==="FITTING"?await tx.fitting.findFirst({where:{...where,id:input.sourceId},include:{items:true}}):null;
 if(input.source==="FITTING"&&!fitting)throw new Error("Примерка недоступна.");
 if(fitting&&!permits(member,"FITTING_ASSIGN")&&fitting.assignedMembershipId!==actor.membershipId)throw new Error("Нет права преобразовать чужую примерку.");
 const inquiryId=input.source==="INQUIRY"?input.sourceId:fitting?.inquiryId;
 if(inquiryId)await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inquiry-conversion:${actor.organizationId}:${inquiryId}`},0))`);
 if(inquiryId)await tx.$queryRaw(Prisma.sql`SELECT id FROM inquiries WHERE id=${inquiryId}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`);
 const inquiry=inquiryId?await tx.inquiry.findFirst({where:{...where,id:inquiryId},include:{items:true}}):null;
 if(inquiryId&&(!inquiry||!permits(member,"LEAD_VIEW")||!permits(member,"LEAD_CONVERT_TO_ORDER")))throw new Error("Обращение недоступно для создания заказа.");
 const source=fitting??inquiry;if(!source)throw new Error("Источник недоступен.");
 await workflowScope(tx,actor,["CUSTOMER_VIEW"],source.branchId);
 const previous=source.orderId??inquiry?.orderId;
 if(previous){const order=await tx.order.findFirst({where:{id:previous,...where}});if(!order)throw new Error("Заказ недоступен.");if(order.customerId!==input.customerId||order.rentalStartAt?.getTime()!==input.rentalStart.getTime()||order.rentalEndAt?.getTime()!==input.rentalEnd.getTime())throw new Error("Заказ уже создан с другими условиями. Откройте существующий заказ.");if(fitting&&!fitting.orderId){await tx.fitting.update({where:{id:fitting.id},data:{orderId:order.id,customerId:input.customerId,version:{increment:1}}});await appendAuditLog(tx,{organizationId:actor.organizationId,branchId:source.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"FITTING_LINKED_TO_ORDER",entityType:"Fitting",entityId:fitting.id,metadata:{orderId:order.id}});}return order.id;}
 if((fitting&&["CANCELLED","NO_SHOW"].includes(fitting.status))||inquiry?.status==="CLOSED")throw new Error("Из закрытой записи нельзя создать заказ.");
 const assignedMembershipId=input.assignedMembershipId??actor.membershipId;
 if(assignedMembershipId!==actor.membershipId&&!permits(member,"ORDER_ASSIGN"))throw new Error("Нет права назначать другого ответственного.");
 await validateWorkflowAssignee(tx,actor,source.branchId,assignedMembershipId,["ORDER_VIEW","ORDER_EDIT"]);
 const items=source.items.map(item=>({productVariantId:item.productVariantId,quantity:1}));
 const channel=source.source==="TELEGRAM"?"OTHER":source.source;
 // The existing rental command still validates catalogue policy, price and availability.
 // It creates a draft only. Reservation remains an explicit lifecycle command.
 const order=await createOrder(createTenantContext(actor.organizationId),{branchId:source.branchId,customerId:input.customerId,source:channel,rentalStart:input.rentalStart,rentalEnd:input.rentalEnd,internalComment:null},items,actor,tx);
 await tx.order.update({where:{id:order.id},data:{assignedMembershipId}});
 if(inquiry)await tx.inquiry.update({where:{id:inquiry.id},data:{orderId:order.id,customerId:input.customerId,status:"ORDER",version:{increment:1}}});
 if(fitting)await tx.fitting.update({where:{id:fitting.id},data:{orderId:order.id,customerId:input.customerId,version:{increment:1}}});
 await appendAuditLog(tx,{organizationId:actor.organizationId,branchId:source.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"SOURCE_CONVERTED_TO_ORDER",entityType:input.source==="INQUIRY"?"Inquiry":"Fitting",entityId:source.id,metadata:{orderId:order.id,inquiryId:inquiry?.id??null,fittingId:fitting?.id??null,assignedMembershipId}});
 if(fitting&&inquiry)await appendAuditLog(tx,{organizationId:actor.organizationId,branchId:source.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"SOURCE_CONVERTED_TO_ORDER",entityType:"Inquiry",entityId:inquiry.id,metadata:{orderId:order.id,fittingId:fitting.id,status:"ORDER"}});
 return order.id;
 },{timeout:30000,maxWait:10000});}
export async function assignOrder(actor:WorkflowActor,orderId:string,assignedMembershipId:string|null){uuid.parse(orderId);if(assignedMembershipId)uuid.parse(assignedMembershipId);return db.$transaction(async tx=>{
 const {where,member}=await workflowScope(tx,actor,["ORDER_VIEW","ORDER_EDIT"]);
 await tx.$queryRaw(Prisma.sql`SELECT id FROM orders WHERE id=${orderId}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`);
 const order=await tx.order.findFirst({where:{...where,id:orderId}});if(!order)throw new Error("Заказ недоступен.");if(order.assignedMembershipId===assignedMembershipId)return;
 if(!permits(member,"ORDER_ASSIGN")&&(assignedMembershipId!==actor.membershipId||order.assignedMembershipId!==null))throw new Error("Нет права менять ответственного за заказ.");
 await workflowScope(tx,actor,[],order.branchId);
 if(assignedMembershipId)await validateWorkflowAssignee(tx,actor,order.branchId,assignedMembershipId,["ORDER_VIEW","ORDER_EDIT"]);
 await tx.order.update({where:{id:orderId},data:{assignedMembershipId}});
 await appendAuditLog(tx,{organizationId:actor.organizationId,branchId:order.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"ORDER_ASSIGNEE_CHANGED",entityType:"Order",entityId:orderId,metadata:{previousAssigneeId:order.assignedMembershipId,assignedMembershipId}});
 });}
export async function workflowOptions(actor:WorkflowActor,permission:"FITTING_VIEW"|"LEAD_VIEW"|"ORDER_VIEW",branchId?:string,q="") {return db.$transaction(async tx=>{
 const {member,where}=await workflowScope(tx,actor,[permission],branchId);
 const branches=await tx.branch.findMany({where:{organizationId:actor.organizationId,status:"ACTIVE",id:where.branchId},select:{id:true,name:true,timezone:true},orderBy:{name:"asc"}});
 const selected=branches.find(row=>row.id===branchId)??branches[0];if(!selected)return{branches,branch:null,members:[],customers:[],variants:[]};
 const candidates=await tx.organizationMembership.findMany({where:{organizationId:actor.organizationId,status:"ACTIVE",user:{status:"ACTIVE"},OR:[{role:"OWNER"},{branchAccess:{some:{organizationId:actor.organizationId,branchId:selected.id}}}]},select:{id:true,...permissionMemberSelect,user:{select:{displayName:true}}},orderBy:{user:{displayName:"asc"}}});
 const assignmentKey=permission==="FITTING_VIEW"?"FITTING_ASSIGN":"ORDER_ASSIGN";
 const workerKey=permission==="FITTING_VIEW"?"FITTING_MANAGE":"ORDER_EDIT";
 const members=candidates.filter(m=>permits(m,permission==="LEAD_VIEW"?"ORDER_VIEW":permission)&&permits(m,workerKey)&&(permits(member,assignmentKey)||m.id===actor.membershipId)).map(m=>({id:m.id,name:m.user.displayName}));
 const query=q.trim().slice(0,100);
 const [customers,variants]=await Promise.all([
 permits(member,"CUSTOMER_VIEW")?tx.customer.findMany({where:{organizationId:actor.organizationId,status:{not:"ARCHIVED"},...(query?{OR:[{firstName:{contains:query,mode:"insensitive"}},{lastName:{contains:query,mode:"insensitive"}},{customerNumber:{contains:query}}]}:{})},select:{id:true,firstName:true,lastName:true,customerNumber:true},take:50,orderBy:{createdAt:"desc"}}):[],
 permits(member,"CATALOG_VIEW")?tx.productVariant.findMany({where:{organizationId:actor.organizationId,isActive:true,product:{publicationStatus:"ACTIVE",archivedAt:null},...(query?{OR:[{sku:{contains:query,mode:"insensitive"}},{product:{name:{contains:query,mode:"insensitive"}}}]}:{})},select:{id:true,sku:true,product:{select:{name:true}},size:{select:{name:true}},execution:{select:{name:true}}},take:50,orderBy:{sku:"asc"}}):[]]);
 return{branches,branch:selected,members,customers,variants};
});}
export async function updateInquirySelection(actor:WorkflowActor,raw:unknown){const input=z.object({id:uuid,version:z.number().int().positive(),variantIds:z.array(uuid).max(20).transform(ids=>[...new Set(ids)])}).parse(raw);return db.$transaction(async tx=>{
 const {where}=await workflowScope(tx,actor,["LEAD_VIEW","LEAD_EDIT","CATALOG_VIEW"]);
 const inquiry=await tx.inquiry.findFirst({where:{...where,id:input.id},include:{items:true}});if(!inquiry||inquiry.version!==input.version)throw new Error("Обращение недоступно или уже изменено. Обновите страницу.");if(inquiry.orderId)throw new Error("Заказ уже создан. Изменяйте товары в карточке заказа.");
 const kept=new Map(inquiry.items.map(item=>[item.productVariantId,item])),added=input.variantIds.filter(id=>!kept.has(id));
 const variants=await tx.productVariant.findMany({where:{organizationId:actor.organizationId,id:{in:added},isActive:true,product:{publicationStatus:"ACTIVE",archivedAt:null}},select:{id:true,sku:true,product:{select:{name:true}},execution:{select:{name:true}},size:{select:{name:true,code:true}}}});if(variants.length!==added.length)throw new Error("Один из товаров недоступен.");
 const changed=await tx.inquiry.updateMany({where:{...where,id:input.id,version:input.version,orderId:null},data:{version:{increment:1}}});if(changed.count!==1)throw new Error("Обращение уже изменено. Обновите страницу.");
 await tx.inquiryItem.deleteMany({where:{organizationId:actor.organizationId,inquiryId:input.id,productVariantId:{notIn:input.variantIds}}});
 if(variants.length)await tx.inquiryItem.createMany({data:variants.map(v=>({organizationId:actor.organizationId,inquiryId:input.id,productVariantId:v.id,nameSnapshot:`${v.product.name}${v.execution?` · ${v.execution.name}`:""}`,skuSnapshot:v.sku,sizeSnapshot:v.size.name||v.size.code}))});
 await appendAuditLog(tx,{organizationId:actor.organizationId,branchId:inquiry.branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"INQUIRY_SELECTION_UPDATED",entityType:"Inquiry",entityId:input.id,metadata:{itemCount:input.variantIds.length}});
 });}
