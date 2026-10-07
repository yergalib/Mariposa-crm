import { defaultHasPermission, PERMISSION_REGISTRY, type PermissionKey } from "./registry";
import type { AppRole } from "@/lib/auth/access";

// Ownership is an organization invariant. Every other operation is decided by
// the assigned bundle, followed by the explicit individual override.
export type PermissionMember = {
  role: AppRole;
  permissionRole?: { permissionKeys: string[] } | null;
  permissionOverrides: { permissionKey: string; effect: string }[];
};
export const permissionMemberSelect = {
  role: true,
  permissionRole: { select: { permissionKeys: true } },
  permissionOverrides: { select: { permissionKey: true, effect: true } },
} as const;
export function bundleAllows(member: PermissionMember, key: PermissionKey) {
  return member.role === "OWNER" || (member.permissionRole
    ? member.permissionRole.permissionKeys.includes(key)
    : defaultHasPermission(member.role, key));
}
export function memberHasPermission(member: PermissionMember, key: PermissionKey) {
  if (member.role === "OWNER") return true;
  const override = member.permissionOverrides.find(row => row.permissionKey === key);
  return override ? override.effect === "ALLOW" : bundleAllows(member, key);
}

export function memberPermissions(member: PermissionMember) { return new Set((Object.keys(PERMISSION_REGISTRY) as PermissionKey[]).filter(key => memberHasPermission(member, key))); }
