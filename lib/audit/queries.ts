import "server-only";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import type { AuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { accessibleBranchIds } from "@/lib/staff/branch-access";

export async function listAuditLogs(tenant:TenantContext,actor:Pick<AuthContext,"membershipId"|"role">,options:{take?:number;cursor?:string}={}){
  await requirePermission({organizationId:tenant.organizationId,...actor},"AUDIT_LOG_VIEW");
  const branchIds=await accessibleBranchIds(tenant,actor.membershipId),take=Math.min(Math.max(options.take??50,1),100);
  return db.auditLog.findMany({where:{organizationId:tenant.organizationId,...branchIds?{OR:[{branchId:null},{branchId:{in:branchIds}}]}:{}},orderBy:[{occurredAt:"desc"},{id:"desc"}],take,...options.cursor?{cursor:{id:options.cursor},skip:1}:{},select:{id:true,branchId:true,action:true,entityType:true,entityId:true,result:true,source:true,metadata:true,occurredAt:true,actorUser:{select:{displayName:true}}}});
}
