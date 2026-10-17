import 'server-only';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { getCurrentSession, type AuthContext } from '@/lib/auth/session';
import { appendAuditLog } from '@/lib/audit/log';
import { PILOT_TEST, pilotTestConfigured } from './pilot-test-config';
import type { HistorySnapshot } from './history/contracts';
export class PilotTestError extends Error { constructor(message: string, public status = 403) { super(message); } }
type Client = Pick<Prisma.TransactionClient, 'auditLog' | 'inquiry'>;
export type PilotWindow = { status: 'not_started' | 'active' | 'closed'; until: string | null; inquiryHref?: string };
export function assertPilotSession(session: AuthContext | null): asserts session is AuthContext {
  if (!pilotTestConfigured() || !session || session.organizationId !== PILOT_TEST.organizationId
    || session.membershipId !== PILOT_TEST.membershipId || session.role !== 'OWNER' || session.expiresAt <= new Date()
    || (!session.hasOrganizationWideBranchAccess && !session.allowedBranchIds.includes(PILOT_TEST.branchId)))
    throw new PilotTestError('Тест доступен только разрешённой учётной записи Pilot OWNER.');
}
export async function assertPilotOwner(owner?: { organizationId: string; principal: string }) {
  const session = await getCurrentSession(); assertPilotSession(session);
  const principal = createHash('sha256').update(JSON.stringify([session.organizationId, session.userId, session.sessionId])).digest('hex');
  if (owner && (owner.organizationId !== session.organizationId || owner.principal !== principal)) throw new PilotTestError('Недоступная история теста.');
  return session;
}
export async function pilotWindow(client: Client = db): Promise<PilotWindow> {
  const event = await client.auditLog.findFirst({ where: { organizationId: PILOT_TEST.organizationId, action: 'PILOT_HISTORY_TEST_STARTED', entityType: 'AssistantPilotTest', entityId: PILOT_TEST.runId }, select: { occurredAt: true }, orderBy: { occurredAt: 'asc' } });
  if (!event) return { status: 'not_started', until: null };
  const until = new Date(event.occurredAt.getTime() + PILOT_TEST.durationMs);
  const active = Date.now() >= event.occurredAt.getTime() && Date.now() < until.getTime();
  const inquiry = active ? await client.inquiry.findUnique({ where: { organizationId_creationKey: { organizationId: PILOT_TEST.organizationId, creationKey: PILOT_TEST.runId } }, select: { id: true } }) : null;
  return { status: active ? 'active' : 'closed', until: until.toISOString(), ...(inquiry ? { inquiryHref: `/chats/${inquiry.id}` } : {}) };
}
export async function requirePilotWindow(client: Client = db) {
  const window = await pilotWindow(client);
  if (window.status !== 'active') throw new PilotTestError(window.status === 'closed' ? '30-минутное окно закрыто. Повторный запуск недоступен.' : 'Сначала явно запустите 30-минутный тест.', 410);
  return window;
}
export async function startPilotWindow() {
  const session = await assertPilotOwner();
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pilot-history:${PILOT_TEST.runId}`},0))`;
    const existing = await pilotWindow(tx);
    if (existing.status !== 'not_started') return existing;
    await appendAuditLog(tx, { organizationId: session.organizationId, branchId: PILOT_TEST.branchId, actorUserId: session.userId, actorMembershipId: session.membershipId,
      action: 'PILOT_HISTORY_TEST_STARTED', entityType: 'AssistantPilotTest', entityId: PILOT_TEST.runId, correlationId: PILOT_TEST.runId, source: 'SYSTEM' });
    return pilotWindow(tx);
  });
}
export function validatePilotWrite(input: { action: string; key?: string; contact?: string; snapshot?: HistorySnapshot }) {
  if ((input.action === 'consent' || input.action === 'handoff') && input.key !== PILOT_TEST.runId) throw new PilotTestError('Разрешён только один тестовый диалог и одна заявка.');
  if (input.action === 'handoff' && input.contact !== PILOT_TEST.contact) throw new PilotTestError('Используйте только синтетический контакт теста.');
  if (input.snapshot) {
    const s = input.snapshot, refs = s.selectedProducts ?? [];
    if (s.branchId !== PILOT_TEST.branchId || refs.length !== 1 || refs[0].variantId !== PILOT_TEST.variantId || refs[0].productId !== PILOT_TEST.productId
      || refs[0].executionId !== null || refs[0].slot !== 'dress' || s.context?.selected.dress !== PILOT_TEST.variantId
      || Object.values(s.context.selected).filter(Boolean).length !== 1 || !s.context.notes?.includes(`[E2E PILOT ${PILOT_TEST.runId}]`)
      || s.messages.some(m => !m.content.startsWith('[E2E]'))) throw new PilotTestError('Сохраняется только помеченный синтетический сценарий теста.');
  }
}
