import "server-only";
import type {AuthContext} from "@/lib/auth/session";
import type {TenantContext} from "@/lib/tenant/context";
import type {PermissionKey} from "./registry";
import {changeIndividualPermission} from "./roles";
export async function setPermissionOverride(tenant:TenantContext,targetMembershipId:string,key:PermissionKey,effect:"ALLOW"|"DENY"|null,actor:Pick<AuthContext,"userId"|"membershipId"|"role">){return changeIndividualPermission({...actor,organizationId:tenant.organizationId},targetMembershipId,key,effect)}
