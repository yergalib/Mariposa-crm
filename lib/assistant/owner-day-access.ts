import "server-only";
import { oncePerReadRequest } from "@/lib/showroom/request-timing";
import { createHash } from "node:crypto";
import { getCurrentSession, type AuthContext } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import type { PermissionKey } from "@/lib/permissions/registry";
import type { Prisma } from "@/generated/prisma/client";
import { AssistantError } from "./chat/limits";
import { OWNER_DAY, ownerDayConfig } from "./owner-day-config";

export function assertOwnerDaySession(session: AuthContext | null): asserts session is AuthContext {
  const config = ownerDayConfig();
  if (!config) throw new AssistantError("Владельческий тест закрыт.", 503);
  if (!session) throw new AssistantError("Войдите в разрешённую учётную запись владельца.", 401);
  if (session.organizationId !== config.organizationId || session.membershipId !== config.membershipId
    || session.role !== "OWNER" || session.expiresAt <= new Date())
    throw new AssistantError("Этот тест недоступен в текущей сессии.", 403);
}
export async function requireOwnerDaySession(extra: PermissionKey[] = []) {
  const session = await oncePerReadRequest("session", getCurrentSession); // Checks revoked session, active user/org/membership.
  assertOwnerDaySession(session);
  for (const permission of new Set<PermissionKey>(["CATALOG_VIEW", ...extra])) {
    if (!await (permission === "CATALOG_VIEW" ? oncePerReadRequest("catalog_permission", () => hasPermission(session, permission)) : hasPermission(session, permission))) throw new AssistantError("Недостаточно прав для теста.", 403);
  }
  return session;
}
export async function requireOwnerDayHistory(owner: { organizationId: string; principal: string }, handoff = false) {
  const session = await requireOwnerDaySession(handoff ? ["LEAD_VIEW", "LEAD_CREATE"] : []);
  const principal = createHash("sha256").update(JSON.stringify([session.organizationId, session.userId, session.sessionId])).digest("hex");
  if (owner.organizationId !== session.organizationId || owner.principal !== principal)
    throw new AssistantError("История принадлежит другой сессии.", 403);
}
export async function requireOwnerDayWriteWindow(tx: Prisma.TransactionClient) {
  const config = ownerDayConfig();
  if (!config) throw new AssistantError("Владельческий тест закрыт.", 503);
  const [row] = await tx.$queryRaw<{ open: boolean }[]>`SELECT clock_timestamp() >= ${new Date(OWNER_DAY.start)}
    AND clock_timestamp() < ${new Date(OWNER_DAY.until)} AS open`;
  if (!row?.open) throw new AssistantError("Время владельческого теста истекло.", 503);
}
