import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { appendAuditLog } from "./log";
export async function auditedExportResponse(actor:Pick<AuthContext,"organizationId"|"userId"|"membershipId">,entityType:string,response:Response){
 await appendAuditLog(db,{organizationId:actor.organizationId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,action:"DATA_EXPORTED",entityType,metadata:{sourceType:"EXPORT"}});return response;
}
