import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { defaultHasPermission, type PermissionKey } from "@/lib/permissions/registry";
import { appendAuditLog } from "@/lib/audit/log";

type Actor = Pick<AuthContext,"organizationId"|"membershipId"|"userId">;
const text = z.string().trim().min(1).max(100);
const optional = z.string().trim().max(300).transform(value=>value||null);
const id = z.string().uuid().optional();
const command = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("organization"),name:text,turnaroundBufferMinutes:z.coerce.number().int().min(0).max(10080)}),
  z.object({kind:z.literal("branch"),id,status:z.enum(["ACTIVE","INACTIVE"]).default("ACTIVE"),name:text,code:z.string().trim().regex(/^[A-Za-z0-9_-]{1,50}$/),city:text,address:optional,phone:optional,timezone:text.refine(value=>{try{new Intl.DateTimeFormat("en",{timeZone:value});return true}catch{return false}},"Неизвестный часовой пояс.")}),
  z.object({kind:z.literal("location"),id,isActive:z.boolean().default(true),branchId:z.string().uuid(),name:text,code:z.string().trim().regex(/^[A-Za-z0-9_-]{1,50}$/),type:z.enum(["SHOWROOM","WAREHOUSE","STORAGE_ZONE","CLEANING","REPAIR","TRANSIT","OTHER"])}),
  z.object({kind:z.literal("payment"),id,code:z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,49}$/),displayName:text,isActive:z.boolean()})
]);
async function scope(tx:Prisma.TransactionClient,actor:Actor,key:PermissionKey){
  const member=await tx.organizationMembership.findFirst({where:{id:actor.membershipId,organizationId:actor.organizationId,userId:actor.userId,status:"ACTIVE",user:{status:"ACTIVE"}},select:{role:true,permissionOverrides:{where:{permissionKey:key},select:{effect:true}},branchAccess:{where:{branch:{status:"ACTIVE"}},select:{branchId:true}}}});
  if(!member || !(member.role==="OWNER" || (member.permissionOverrides[0]?member.permissionOverrides[0].effect==="ALLOW":defaultHasPermission(member.role,key))))throw new Error("Нет доступа к настройкам.");
  return member;
}
export async function getBusinessSettings(actor:Actor){return db.$transaction(async tx=>{
  const member=await scope(tx,actor,"SETTINGS_VIEW"),organizationId=actor.organizationId;
  const branches=await tx.branch.findMany({where:{organizationId,...(member.role==="OWNER"?{}:{id:{in:member.branchAccess.map(row=>row.branchId)}})},orderBy:{name:"asc"},include:{locations:{orderBy:{name:"asc"}}}});
  const [organization,settings,paymentMethods]=await Promise.all([tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{name:true,defaultCurrency:true,timezone:true}}),tx.organizationSettings.findUnique({where:{organizationId}}),tx.paymentMethod.findMany({where:{organizationId},orderBy:[{sortOrder:"asc"},{displayName:"asc"}]})]);
  return{organization,settings,branches,paymentMethods,isOwner:member.role==="OWNER"};
});}
export async function saveBusinessSetting(actor:Actor,raw:unknown){const input=command.parse(raw);return db.$transaction(async tx=>{
  const member=await scope(tx,actor,"SETTINGS_MANAGE"),organizationId=actor.organizationId;
  const owner=()=>{if(member.role!=="OWNER")throw new Error("Общие настройки меняет владелец.")};
  const branchScope=async(branchId:string)=>{
    if(member.role!=="OWNER"&&!member.branchAccess.some(row=>row.branchId===branchId))throw new Error("Филиал недоступен.");
    if(!await tx.branch.findFirst({where:{id:branchId,organizationId,status:"ACTIVE"},select:{id:true}}))throw new Error("Филиал недоступен.");
  };
  let entityId=organizationId,branchId:string|undefined,previousValue: string|null=null,newValue:string|null=null;
  if(input.kind==="organization"){
    owner();const old=await tx.organizationSettings.findUnique({where:{organizationId}});
    previousValue=String(old?.turnaroundBufferMinutes??0);newValue=String(input.turnaroundBufferMinutes);
    await tx.organization.update({where:{id:organizationId},data:{name:input.name}});
    await tx.organizationSettings.upsert({where:{organizationId},create:{organizationId,turnaroundBufferMinutes:input.turnaroundBufferMinutes},update:{turnaroundBufferMinutes:input.turnaroundBufferMinutes}});
  }else if(input.kind==="branch"){
    const {kind:_,id:recordId,...data}=input;void _;
    if(recordId){if(member.role!=="OWNER")await branchScope(recordId);else if(!await tx.branch.findFirst({where:{id:recordId,organizationId,status:{not:"ARCHIVED"}},select:{id:true}}))throw new Error("Филиал недоступен.");const old=await tx.branch.findFirstOrThrow({where:{id:recordId,organizationId}});if(old.timezone!==data.timezone){owner();if(await tx.order.count({where:{organizationId,branchId:recordId}})||await tx.fitting.count({where:{organizationId,branchId:recordId}}))throw new Error("Часовой пояс филиала с заказами или примерками менять нельзя.");}if(data.status!==old.status&&data.status==="INACTIVE"){owner();if(await tx.branch.count({where:{organizationId,status:"ACTIVE"}})<=1)throw new Error("Нельзя отключить последний активный филиал.");if(await tx.membershipBranchAccess.count({where:{organizationId,branchId:recordId}})||await tx.stockLevel.count({where:{organizationId,branchId:recordId,quantity:{not:0}}})||await tx.productInstance.count({where:{organizationId,currentBranchId:recordId,operationalStatus:{notIn:["SOLD","WRITTEN_OFF","LOST"]}}})||await tx.order.count({where:{organizationId,branchId:recordId,status:{notIn:["COMPLETED","CANCELLED","EXPIRED","NO_SHOW"]}}})||await tx.fitting.count({where:{organizationId,branchId:recordId,status:{in:["SCHEDULED","ARRIVED"]}}}))throw new Error("Сначала перенесите доступ сотрудников, остатки и незавершённую работу из филиала.");}entityId=(await tx.branch.update({where:{id:recordId},data})).id;}
    else{owner();entityId=(await tx.branch.create({data:{...data,organizationId}})).id;}branchId=entityId;
  }else if(input.kind==="location"){
    await branchScope(input.branchId);branchId=input.branchId;const {kind:_,id:recordId,...data}=input;void _;
    if(recordId){const previous=await tx.location.findFirst({where:{id:recordId,organizationId,branchId},select:{id:true,type:true}});if(!previous)throw new Error("Место хранения недоступно.");if(previous.type!==data.type&&(await tx.stockLevel.count({where:{organizationId,locationId:recordId,quantity:{not:0}}})||await tx.productInstance.count({where:{organizationId,currentLocationId:recordId,operationalStatus:{notIn:["SOLD","WRITTEN_OFF","LOST"]}}})||await tx.capacityAllocation.count({where:{organizationId,maintenanceLocationId:recordId,status:"ACTIVE"}})))throw new Error("Нельзя менять тип места хранения с остатками или текущим обслуживанием.");if(!data.isActive){if(await tx.location.count({where:{organizationId,branchId,isActive:true}})<=1)throw new Error("Нельзя отключить последнее активное место хранения.");if(await tx.stockLevel.count({where:{organizationId,locationId:recordId,quantity:{not:0}}})||await tx.productInstance.count({where:{organizationId,currentLocationId:recordId,operationalStatus:{notIn:["SOLD","WRITTEN_OFF","LOST"]}}})||await tx.capacityAllocation.count({where:{organizationId,maintenanceLocationId:recordId,status:"ACTIVE"}}))throw new Error("Сначала перенесите остатки и обслуживание из места хранения.");}entityId=(await tx.location.update({where:{id:recordId},data:{name:data.name,code:data.code,type:data.type,isActive:data.isActive}})).id;}
    else entityId=(await tx.location.create({data:{...data,organizationId}})).id;
  }else{
    owner();const {kind:_,id:recordId,...data}=input;void _;
    if(recordId){const old=await tx.paymentMethod.findFirst({where:{id:recordId,organizationId}});if(!old)throw new Error("Способ оплаты не найден.");if(old.code!==data.code)throw new Error("Код существующего способа оплаты неизменяем.");if(old.isActive&&!data.isActive&&await tx.paymentMethod.count({where:{organizationId,isActive:true}})<=1)throw new Error("Нельзя отключить последний активный способ оплаты.");previousValue=String(old.isActive);entityId=(await tx.paymentMethod.update({where:{id:recordId},data})).id;}
    else entityId=(await tx.paymentMethod.create({data:{...data,organizationId}})).id;newValue=String(data.isActive);
  }
  await appendAuditLog(tx,{organizationId,branchId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"BUSINESS_SETTING_CHANGED",entityType:input.kind,entityId,metadata:{settingKey:input.kind,previousValue,newValue}});
  return entityId;
},{isolationLevel:"Serializable"});}
