import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AppRole } from "@/lib/auth/access";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { defaultHasPermission, type PermissionKey } from "@/lib/permissions/registry";
import type { TenantContext } from "@/lib/tenant/context";

export type BulkOperationalActor = {
  userId: string;
  membershipId: string;
  role: AppRole;
};

export async function authorizeBulkOperation(
  tx: Prisma.TransactionClient,
  tenant: TenantContext,
  actor: BulkOperationalActor,
  permission: PermissionKey,
  branchId?: string
) {
  const membership = await tx.organizationMembership.findFirst({
    where: {
      id: actor.membershipId,
      organizationId: tenant.organizationId,
      userId: actor.userId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      organization: { status: "ACTIVE" }
    },
    select: {
      role: true,
      permissionOverrides: { where: { permissionKey: permission }, select: { effect: true }, take: 1 },
      branchAccess: branchId
        ? { where: { branchId, branch: { status: "ACTIVE" } }, select: { id: true, branchId: true }, take: 1 }
        : { where: { branch: { status: "ACTIVE" } }, select: { id: true, branchId: true } }
    }
  });
  if (!membership) throw new FulfillmentError("NOT_FOUND", "Операция недоступна.");
  const override = membership.permissionOverrides[0];
  const permitted = membership.role === "OWNER"
    || (override ? override.effect === "ALLOW" : defaultHasPermission(membership.role, permission));
  if (!permitted) throw new FulfillmentError("FORBIDDEN", "Недостаточно прав для операции.");
  if (branchId) {
    const activeBranch = await tx.branch.findFirst({
      where: { id: branchId, organizationId: tenant.organizationId, status: "ACTIVE" },
      select: { id: true }
    });
    if (!activeBranch || membership.role !== "OWNER" && !membership.branchAccess.length) {
      throw new FulfillmentError("NOT_FOUND", "Филиал недоступен.");
    }
  }
  return membership;
}
