import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { appendAuditLog } from "./log";
export type AuditActor={userId:string;membershipId?:string};
export function auditedMutation<T>(tenant:TenantContext,actor:AuditActor|undefined,action:string,entityType:string,entityId:string|null,run:(tx:Prisma.TransactionClient)=>Promise<T>){
 return db.$transaction(async tx=>{const result=await run(tx);const resultId=result&&typeof result==="object"&&"id" in result&&typeof result.id==="string"?result.id:entityId;
 await appendAuditLog(tx,{organizationId:tenant.organizationId,actorUserId:actor?.userId,actorMembershipId:actor?.membershipId,action,entityType,entityId:resultId,source:actor?"CRM":"SYSTEM",metadata:{detailsChanged:true}});return result;},{maxWait:10000,timeout:30000});
}
