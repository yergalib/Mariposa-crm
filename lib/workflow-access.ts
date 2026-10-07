import "server-only";
import type {Prisma} from "@/generated/prisma/client";
import type {AuthContext} from "@/lib/auth/session";
import {type PermissionKey} from "@/lib/permissions/registry";
import {memberHasPermission, permissionMemberSelect} from "@/lib/permissions/member";
export type WorkflowActor=Pick<AuthContext,"organizationId"|"membershipId"|"userId">;
export const permits=memberHasPermission;
export async function workflowScope(tx:Prisma.TransactionClient,actor:WorkflowActor,keys:PermissionKey[],branchId?:string){
 const member=await tx.organizationMembership.findFirst({where:{id:actor.membershipId,organizationId:actor.organizationId,userId:actor.userId,status:"ACTIVE",user:{status:"ACTIVE"}},select:{...permissionMemberSelect,branchAccess:{where:{branch:{status:"ACTIVE"}},select:{branchId:true}}}});
 if(!member||keys.some(key=>!permits(member,key)))throw new Error("Недостаточно прав для операции.");
 const branchIds=member.role==="OWNER"?null:member.branchAccess.map(row=>row.branchId);
 if(branchId&&(branchIds!==null&&!branchIds.includes(branchId)||!await tx.branch.findFirst({where:{id:branchId,organizationId:actor.organizationId,status:"ACTIVE"},select:{id:true}})))throw new Error("Филиал недоступен.");
 return{member,where:{organizationId:actor.organizationId,...(branchIds===null?{}:{branchId:{in:branchIds}})}};
}
export async function validateWorkflowAssignee(tx:Prisma.TransactionClient,actor:WorkflowActor,branchId:string,membershipId:string,keys:PermissionKey[]){
 const member=await tx.organizationMembership.findFirst({where:{id:membershipId,organizationId:actor.organizationId,status:"ACTIVE",user:{status:"ACTIVE"},OR:[{role:"OWNER"},{branchAccess:{some:{organizationId:actor.organizationId,branchId}}}]},select:{...permissionMemberSelect}});
 if(!member||keys.some(key=>!permits(member,key)))throw new Error("Сотруднику недоступна работа в этом филиале.");
}
