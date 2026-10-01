import "server-only";
import {Prisma} from "@/generated/prisma/client";
import {db} from "@/lib/db";
import type {TenantContext} from "@/lib/tenant/context";
import {CustomerError} from "@/lib/customers/errors";
import {normalizeEmail,normalizePhone} from "@/lib/customers/normalization";
import {addressSchema,contactSchema,customerSchema,noteSchema} from "@/lib/customers/validation";

type ContactInput={type:"PHONE"|"EMAIL"|"OTHER";value:string;label?:string|null;isPrimary?:boolean;isVerified?:boolean;allowDuplicate?:boolean};
function normalized(c:ContactInput){
  const parsed=contactSchema.parse({...c,isPrimary:!!c.isPrimary,isVerified:!!c.isVerified});
  const normalizedValue=parsed.type==="PHONE"?normalizePhone(parsed.value):parsed.type==="EMAIL"?normalizeEmail(parsed.value):parsed.value.toLocaleLowerCase();
  if(!normalizedValue)throw new CustomerError("VALIDATION","Некорректный контакт.");
  return {...parsed,normalizedValue};
}
type NormalizedContact=ReturnType<typeof normalized>;
const contactTransaction={isolationLevel: "ReadCommitted" as const,maxWait:10000,timeout:30000};
async function duplicatesWithClient(client:Prisma.TransactionClient,tenant:TenantContext,contacts:NormalizedContact[],excludeId?:string){
  const values=contacts.filter(c=>c.type!=="OTHER");if(!values.length)return[];
  const rows=await client.customer.findMany({where:{organizationId:tenant.organizationId,id:excludeId?{not:excludeId}:undefined,contacts:{some:{OR:values.map(c=>({type:c.type,normalizedValue:c.normalizedValue}))}}},select:{id:true,customerNumber:true,firstName:true,lastName:true},take:10});
  return rows.map(r=>({id:r.id,customerNumber:r.customerNumber,name:[r.firstName,r.lastName].filter(Boolean).join(" ")}));
}
export async function findCustomerDuplicates(tenant:TenantContext,contacts:ContactInput[],excludeId?:string){
  return duplicatesWithClient(db,tenant,contacts.map(normalized),excludeId);
}
// All app contact writers acquire owner (existing customer), then sorted contact keys.
// ReadCommitted makes the duplicate read after a lock wait see the preceding commit.
async function lockContactOwner(tx:Prisma.TransactionClient,tenant:TenantContext,customerId:string){
  const key=JSON.stringify(["customer-contact-owner",tenant.organizationId,customerId]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
}
async function lockContacts(tx:Prisma.TransactionClient,tenant:TenantContext,contacts:Array<{type:string;normalizedValue:string}>){
  const keys=[...new Set(contacts.filter(c=>c.type!=="OTHER").map(c=>JSON.stringify(["customer-contact",tenant.organizationId,c.type,c.normalizedValue])))].sort();
  for(const key of keys)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
}

async function allocateNumber(tx:Prisma.TransactionClient,organizationId:string){const rows=await tx.$queryRaw<Array<{value:bigint}>>(Prisma.sql`INSERT INTO "customer_counters" ("organization_id","next_value","updated_at") VALUES (${organizationId}::uuid,2,CURRENT_TIMESTAMP) ON CONFLICT ("organization_id") DO UPDATE SET "next_value"="customer_counters"."next_value"+1,"updated_at"=CURRENT_TIMESTAMP RETURNING "next_value"-1 AS value`);const value=rows[0]?.value;if(!value)throw new CustomerError("VALIDATION","Не удалось создать номер клиента.");return `C-${value.toString().padStart(6,"0")}`;}
export async function createCustomer(tenant:TenantContext,input:{customer:unknown;contacts:ContactInput[];createdByUserId?:string;allowDuplicate?:boolean}){
  const customer=customerSchema.parse(input.customer),contacts=input.contacts.map(normalized);
  return db.$transaction(async tx=>{
    await lockContacts(tx,tenant,contacts);
    const duplicates=await duplicatesWithClient(tx,tenant,contacts);
    if(duplicates.length&&!input.allowDuplicate)throw new CustomerError("POSSIBLE_DUPLICATE","Возможно, такой клиент уже существует.",duplicates);
    const number=await allocateNumber(tx,tenant.organizationId);
    return tx.customer.create({data:{...customer,organizationId:tenant.organizationId,customerNumber:number,createdByUserId:input.createdByUserId,archivedAt:customer.status==="ARCHIVED"?new Date():null,contacts:{create:contacts.map(c=>({...c,organizationId:tenant.organizationId}))}},include:{contacts:true}});
  },contactTransaction);
}
export async function updateCustomer(tenant:TenantContext,id:string,raw:unknown){const data=customerSchema.parse(raw);const result=await db.customer.updateMany({where:{id,organizationId:tenant.organizationId},data:{...data,archivedAt:data.status==="ARCHIVED"?new Date():null}});if(!result.count)throw new CustomerError("NOT_FOUND","Клиент не найден.");}
export async function archiveCustomer(tenant:TenantContext,id:string){const r=await db.customer.updateMany({where:{id,organizationId:tenant.organizationId},data:{status:"ARCHIVED",archivedAt:new Date()}});if(!r.count)throw new CustomerError("NOT_FOUND","Клиент не найден.");}
export async function addContact(tenant:TenantContext,customerId:string,raw:ContactInput){
  const c=normalized(raw);
  return db.$transaction(async tx=>{
    await lockContactOwner(tx,tenant,customerId);
    const customer=await tx.customer.findFirst({where:{id:customerId,organizationId:tenant.organizationId},select:{id:true}});
    if(!customer)throw new CustomerError("NOT_FOUND","Клиент не найден.");
    await lockContacts(tx,tenant,[c]);
    const duplicates=await duplicatesWithClient(tx,tenant,[c],customerId);
    if(duplicates.length&&!raw.allowDuplicate)throw new CustomerError("POSSIBLE_DUPLICATE","Возможно, такой контакт уже принадлежит другому клиенту.",duplicates);
    if(c.isPrimary)await tx.customerContact.updateMany({where:{organizationId:tenant.organizationId,customerId,type:c.type,isPrimary:true},data:{isPrimary:false}});
    return tx.customerContact.create({data:{...c,organizationId:tenant.organizationId,customerId}});
  },contactTransaction);
}
export async function updateContact(tenant:TenantContext,id:string,raw:ContactInput){
  const c=normalized(raw);
  return db.$transaction(async tx=>{
    const identity=await tx.customerContact.findFirst({where:{id,organizationId:tenant.organizationId},select:{customerId:true}});
    if(!identity)throw new CustomerError("NOT_FOUND","Контакт не найден.");
    await lockContactOwner(tx,tenant,identity.customerId);
    const old=await tx.customerContact.findFirst({where:{id,organizationId:tenant.organizationId,customerId:identity.customerId},select:{customerId:true,type:true,normalizedValue:true}});
    if(!old)throw new CustomerError("NOT_FOUND","Контакт не найден.");
    await lockContacts(tx,tenant,[old,c]);
    const duplicates=await duplicatesWithClient(tx,tenant,[c],old.customerId);
    if(duplicates.length&&!raw.allowDuplicate)throw new CustomerError("POSSIBLE_DUPLICATE","Возможно, такой контакт уже принадлежит другому клиенту.",duplicates);
    if(c.isPrimary)await tx.customerContact.updateMany({where:{organizationId:tenant.organizationId,customerId:old.customerId,type:c.type,isPrimary:true,id:{not:id}},data:{isPrimary:false}});
    return tx.customerContact.update({where:{id,organizationId:tenant.organizationId,customerId:old.customerId},data:c});
  },contactTransaction);
}
export async function addAddress(tenant:TenantContext,customerId:string,raw:unknown){const data=addressSchema.parse(raw);return db.$transaction(async tx=>{if(!await tx.customer.findFirst({where:{id:customerId,organizationId:tenant.organizationId},select:{id:true}}))throw new CustomerError("NOT_FOUND","Клиент не найден.");if(data.isPrimary)await tx.customerAddress.updateMany({where:{organizationId:tenant.organizationId,customerId,isPrimary:true},data:{isPrimary:false}});return tx.customerAddress.create({data:{...data,organizationId:tenant.organizationId,customerId}});});}
export async function updateAddress(tenant:TenantContext,id:string,raw:unknown){const data=addressSchema.parse(raw);return db.$transaction(async tx=>{const old=await tx.customerAddress.findFirst({where:{id,organizationId:tenant.organizationId},select:{customerId:true}});if(!old)throw new CustomerError("NOT_FOUND","Адрес не найден.");if(data.isPrimary)await tx.customerAddress.updateMany({where:{organizationId:tenant.organizationId,customerId:old.customerId,isPrimary:true,id:{not:id}},data:{isPrimary:false}});return tx.customerAddress.update({where:{id},data});});}
export async function addNote(tenant:TenantContext,customerId:string,raw:unknown,userId?:string){const data=noteSchema.parse(raw);if(!await db.customer.findFirst({where:{id:customerId,organizationId:tenant.organizationId},select:{id:true}}))throw new CustomerError("NOT_FOUND","Клиент не найден.");return db.customerNote.create({data:{...data,organizationId:tenant.organizationId,customerId,createdByUserId:userId}});}
export async function updateNote(tenant:TenantContext,id:string,raw:unknown){const data=noteSchema.parse(raw);const r=await db.customerNote.updateMany({where:{id,organizationId:tenant.organizationId,archivedAt:null},data});if(!r.count)throw new CustomerError("NOT_FOUND","Заметка не найдена.");}
export async function archiveNote(tenant:TenantContext,id:string){const r=await db.customerNote.updateMany({where:{id,organizationId:tenant.organizationId},data:{archivedAt:new Date()}});if(!r.count)throw new CustomerError("NOT_FOUND","Заметка не найдена.");}
