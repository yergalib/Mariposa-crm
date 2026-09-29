import "server-only";

import { cache } from "react";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import {
  defaultHasPermission,
  isPermissionKey,
  PERMISSION_REGISTRY,
  type PermissionKey,
} from "@/lib/permissions/registry";

type PermissionContext = Pick<AuthContext, "organizationId" | "membershipId" | "role">;

export class PermissionError extends Error {
  constructor(message = "Недостаточно прав для выполнения операции.") {
    super(message);
    this.name = "PermissionError";
  }
}

export async function hasPermission(context: PermissionContext, key: PermissionKey) {
  return (await getEffectivePermissions(context)).has(key);
}

export async function requirePermission(context: PermissionContext, key: PermissionKey) {
  if (!await hasPermission(context, key)) throw new PermissionError();
}

const loadEffectivePermissionKeys = cache(async (
  organizationId: string,
  membershipId: string,
  role: AuthContext["role"],
): Promise<PermissionKey[]> => {
  const membership = await db.organizationMembership.findFirst({
    where: { id: membershipId, organizationId, status: "ACTIVE" },
    select: {
      role: true,
      permissionOverrides: { select: { permissionKey: true, effect: true } },
    },
  });
  if (!membership || membership.role !== role) return [];
  if (membership.role === "OWNER") return Object.keys(PERMISSION_REGISTRY) as PermissionKey[];
  const effective = new Set<PermissionKey>();
  for (const key of Object.keys(PERMISSION_REGISTRY) as PermissionKey[]) {
    if (defaultHasPermission(membership.role, key)) effective.add(key);
  }
  for (const row of membership.permissionOverrides) {
    if (!isPermissionKey(row.permissionKey)) continue;
    if (row.effect === "ALLOW") effective.add(row.permissionKey);
    else effective.delete(row.permissionKey);
  }
  return [...effective];
});

export async function getEffectivePermissions(context: PermissionContext) {
  const keys = await loadEffectivePermissionKeys(
    context.organizationId,
    context.membershipId,
    context.role,
  );
  return new Set(keys);
}
