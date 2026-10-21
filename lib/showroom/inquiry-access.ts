import 'server-only';
import { PUBLIC_INQUIRY_INTAKE_OPEN } from './release';
import { ownerMainRestricted } from '@/lib/assistant/owner-day-config';
import { requireOwnerDaySession } from '@/lib/assistant/owner-day-access';
import { AssistantError } from '@/lib/assistant/chat/limits';
import type { Prisma } from '@/generated/prisma/client';
import type { AuthContext } from '@/lib/auth/session';
import { assertOwnerDaySession, requireOwnerDayWriteWindow } from '@/lib/assistant/owner-day-access';
import { memberHasPermission, permissionMemberSelect } from '@/lib/permissions/member';

export async function requireInquiryIntake() {
  if (ownerMainRestricted()) return requireOwnerDaySession(['LEAD_VIEW', 'LEAD_CREATE']);
  if (!PUBLIC_INQUIRY_INTAKE_OPEN) throw new AssistantError('Онлайн-отправка заявок пока не открыта.', 503);
  return null;
}

// Recheck the same principal on the connection already held by this transaction.
// A nested global-pool read can wait for another transaction that also holds a slot.
export async function requireInquiryTransactionAccess(tx: Prisma.TransactionClient, actor: AuthContext | null) {
  if (!actor) {
    if (ownerMainRestricted()) throw new AssistantError('Войдите в разрешённую учётную запись владельца.', 401);
    if (!PUBLIC_INQUIRY_INTAKE_OPEN) throw new AssistantError('Онлайн-отправка заявок пока не открыта.', 503);
    return;
  }
  assertOwnerDaySession(actor);
  const current = await tx.authSession.findFirst({ where: {
    id: actor.sessionId, organizationId: actor.organizationId, userId: actor.userId, membershipId: actor.membershipId,
    revokedAt: null, expiresAt: { gt: new Date() }, organization: { status: 'ACTIVE' }, user: { status: 'ACTIVE' },
    membership: { id: actor.membershipId, organizationId: actor.organizationId, userId: actor.userId, status: 'ACTIVE', role: 'OWNER' },
  }, select: { membership: { select: permissionMemberSelect } } });
  if (!current) throw new AssistantError('Этот тест недоступен в текущей сессии.', 403);
  for (const key of ['CATALOG_VIEW', 'LEAD_VIEW', 'LEAD_CREATE'] as const) {
    if (!memberHasPermission(current.membership, key)) throw new AssistantError('Недостаточно прав для теста.', 403);
  }
  await requireOwnerDayWriteWindow(tx);
}
