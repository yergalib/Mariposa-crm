import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { createInquiryRecord } from "@/lib/inquiries/record";
import { variantOperationWhere } from "@/lib/catalog/operation-policy";
import { getInquiry } from "@/lib/inquiries/service";
import type { AuthContext } from "@/lib/auth/session";
import { historyEnabled, historyHandoffEnabled } from './access';
import { isolatedPreviewRequested } from '../isolated-preview';
import { pilotTestRequested, PILOT_TEST } from '../pilot-test-config';
import { ownerMainRestricted } from '../owner-day-config';
import { requireOwnerDayHistory, requireOwnerDaySession, requireOwnerDayWriteWindow } from '../owner-day-access';
import { assertPilotOwner, assertPilotSession, pilotWindow, requirePilotWindow, validatePilotWrite, PilotTestError } from '../pilot-test';
import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";
import { handoffPreferences } from "../chat/handoff";
import { HISTORY_POLICY, HISTORY_DAYS, historyWrite, historySnapshot, containsSecret, type HistorySnapshot, type HistoryView } from "./contracts";

export class HistoryError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type HistoryOwner = { organizationId: string; ownerHash: string; principal: string };
type Row = { id: string; version: number; expires_at: Date; snapshot: HistorySnapshot; inquiry_id: string | null; handoff_key: string | null; handoff_hash: string | null; creation_key: string; creation_hash: string };
type Message = { role: "user" | "assistant"; content: string };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const gate = async (owner?: HistoryOwner) => {
  if (!historyEnabled(owner?.organizationId)) throw new HistoryError("Сохранение истории пока не подключено.", 503);
  if (ownerMainRestricted()) {
    if (!owner) throw new HistoryError("Требуется владельческая сессия.", 403);
    await requireOwnerDayHistory(owner);
  }
  if (pilotTestRequested()) { await assertPilotOwner(owner); await requirePilotWindow(); }
};
async function row(tx: Prisma.TransactionClient, owner: HistoryOwner, lock = false) {
  const rows = lock ? await tx.$queryRaw<Row[]>`SELECT * FROM assistant_conversations WHERE organization_id=${owner.organizationId}::uuid AND owner_hash=${owner.ownerHash} AND principal=${owner.principal} AND channel='WEB' AND expires_at>now() FOR UPDATE`
    : await tx.$queryRaw<Row[]>`SELECT * FROM assistant_conversations WHERE organization_id=${owner.organizationId}::uuid AND owner_hash=${owner.ownerHash} AND principal=${owner.principal} AND channel='WEB' AND expires_at>now()`;
  return rows[0] ?? null;
}
function view(value: Row): HistoryView { return { version: value.version, expiresAt: value.expires_at.toISOString(), snapshot: historySnapshot.parse(value.snapshot), handedOff: Boolean(value.inquiry_id) }; }
async function quota(tx: Prisma.TransactionClient, owner: HistoryOwner) {
  for (const [key, limit] of [[digest([owner.organizationId, "WEB"]), 300], [digest(owner), 60]] as const) {
    const result = await tx.$queryRaw<{ count: number }[]>`INSERT INTO assistant_history_quotas (key, window_start, count) VALUES (${key}, date_trunc('hour',now()),1) ON CONFLICT (key,window_start) DO UPDATE SET count=assistant_history_quotas.count+1 RETURNING count`;
    if (result[0].count > limit) throw new HistoryError("Слишком много изменений истории. Попробуйте позже.", 429);
  }
}
async function validateSnapshot(tx: Prisma.TransactionClient, owner: HistoryOwner, snapshot: HistorySnapshot) {
  if (containsSecret(snapshot)) throw new HistoryError("Не сохраняйте пароли, ключи или личные документы.");
  const branch = await tx.branch.findFirst({ where: { id: snapshot.branchId, organizationId: owner.organizationId, isPublic: true, status: "ACTIVE", organization: { status: "ACTIVE" } }, select: { id: true, timezone: true } });
  if (!branch) throw new HistoryError("Выберите доступный филиал.", 404);
  const refs = snapshot.selectedProducts ?? [];
  if (refs.some(ref => snapshot.context?.selected[ref.slot] !== ref.variantId)) throw new HistoryError("Выбранные товары изменились. Обновите выбор.", 409);
  const selected = Object.values(snapshot.context?.selected ?? {}).filter((id): id is string => Boolean(id));
  const ids = [...new Set([...selected, ...refs.map(ref => ref.variantId)])];
  const variants = ids.length ? await tx.productVariant.findMany({ where: { AND: [variantOperationWhere(owner.organizationId, "RENTAL", true), { id: { in: ids } }] }, select: { id: true, productId: true, executionId: true } }) : [];
  if (variants.length !== ids.length || refs.some(ref => !variants.some(v => v.id === ref.variantId && v.productId === ref.productId && v.executionId === ref.executionId))) throw new HistoryError("Один из выбранных товаров больше недоступен. Обновите выбор.", 404);
  // Only selected identifiers persist; transient card lists/search cursors are not durable facts.
  if (snapshot.context) { delete snapshot.context.recentCards; delete snapshot.context.nextSearch; }
  return branch;
}
async function appendMessages(tx: Prisma.TransactionClient, id: string, incoming: Message[]) {
  const old = await tx.$queryRaw<Message[]>`SELECT role,content FROM assistant_messages WHERE conversation_id=${id}::uuid ORDER BY ordinal`;
  let overlap = Math.min(old.length, incoming.length);
  while (overlap && JSON.stringify(old.slice(-overlap)) !== JSON.stringify(incoming.slice(0, overlap))) overlap--;
  const added = incoming.slice(overlap);
  if (old.length + added.length > 64) throw new HistoryError("Лимит сохранённого диалога достигнут. Начните новый диалог.", 409);
  for (const [i, message] of added.entries()) await tx.$executeRaw`INSERT INTO assistant_messages (conversation_id,ordinal,role,content) VALUES (${id}::uuid,${old.length+i},${message.role},${message.content})`;
}
export async function readHistory(owner: HistoryOwner) { await gate(owner); const value = await row(db, owner); if (pilotTestRequested() && value?.creation_key !== PILOT_TEST.runId) return null; return value ? view(value) : null; }
export async function writeHistory(owner: HistoryOwner, raw: unknown) {
  await gate(owner); const parsed = historyWrite.safeParse(raw); if (!parsed.success) throw new HistoryError("Проверьте данные истории и подтверждение.");
  const input = parsed.data;
  if (ownerMainRestricted() && input.action === "handoff") await requireOwnerDayHistory(owner, true);
  if (pilotTestRequested()) validatePilotWrite(input);
  const inputHash = digest(input);
  if (input.action === "handoff" && !historyHandoffEnabled(owner.organizationId)) throw new HistoryError("Передача сотруднику пока не подключена. Напишите в WhatsApp шоурума.", 503);
  return db.$transaction(async tx => {
    if (ownerMainRestricted()) await requireOwnerDayWriteWindow(tx);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`history:${owner.organizationId}`},0))`;
    if (pilotTestRequested()) await requirePilotWindow(tx);
    const current = await row(tx, owner, true);
    if (input.action === "consent") {
      if (current) { if (current.creation_key === input.key && current.creation_hash === inputHash) return view(current); throw new HistoryError("История уже есть. Восстановите её или удалите перед новым диалогом.", 409); }
      await quota(tx, owner); await validateSnapshot(tx, owner, input.snapshot);
      if (!pilotTestRequested() && !ownerMainRestricted()) await tx.$executeRaw`DELETE FROM assistant_conversations WHERE organization_id=${owner.organizationId}::uuid AND owner_hash=${owner.ownerHash} AND principal=${owner.principal} AND channel='WEB' AND expires_at<=now()`;
      const id = randomUUID();
      await tx.$executeRaw`INSERT INTO assistant_conversations (id,organization_id,branch_id,owner_hash,principal,channel,policy,consented_at,expires_at,snapshot,creation_key,creation_hash) VALUES (${id}::uuid,${owner.organizationId}::uuid,${input.snapshot.branchId}::uuid,${owner.ownerHash},${owner.principal},'WEB',${HISTORY_POLICY},now(),now()+interval '7 days',${JSON.stringify(input.snapshot)}::jsonb,${input.key}::uuid,${inputHash})`;
      await appendMessages(tx, id, input.snapshot.messages);
      if (ownerMainRestricted()) await requireOwnerDayWriteWindow(tx);
      if (pilotTestRequested()) await requirePilotWindow(tx);
      return view((await row(tx, owner))!);
    }
    if (!current) throw new HistoryError("История не найдена или срок хранения истёк.", 404);
    if (pilotTestRequested() && current.creation_key !== PILOT_TEST.runId) throw new PilotTestError('Этот диалог не относится к согласованному тесту.');
    if (input.action === "handoff" && current.inquiry_id) {
      if (current.handoff_key !== input.key || current.handoff_hash !== digest(input)) throw new HistoryError("Диалог уже передан. Повторная заявка не создаётся.", 409);
      return view(current);
    }
    if (current.version !== input.version || current.inquiry_id) throw new HistoryError("История изменилась или уже передана. Восстановите её перед продолжением.", 409);
    await quota(tx, owner);
    if (input.action === "save") {
      await validateSnapshot(tx, owner, input.snapshot); await appendMessages(tx, current.id, input.snapshot.messages);
      await tx.$executeRaw`UPDATE assistant_conversations SET snapshot=${JSON.stringify(input.snapshot)}::jsonb,branch_id=${input.snapshot.branchId}::uuid,version=version+1 WHERE id=${current.id}::uuid`;
    } else {
      const snapshot = historySnapshot.parse(current.snapshot); const branch = await validateSnapshot(tx, owner, snapshot);
      const from = snapshot.context?.from, until = snapshot.context?.until;
      if (Boolean(from) !== Boolean(until)) throw new HistoryError("Укажите обе даты периода или оставьте обе пустыми.");
      let requestedFrom: Date | null = null, requestedUntil: Date | null = null;
      try {
        requestedFrom = from ? parseBusinessLocalDateTime(from, branch.timezone) : null;
        requestedUntil = until ? parseBusinessLocalDateTime(until, branch.timezone) : null;
      } catch { throw new HistoryError("Проверьте даты и время выбранного филиала."); }
      if (requestedFrom && requestedUntil && requestedFrom >= requestedUntil) throw new HistoryError("Конец периода должен быть позже начала.");
      const contact = input.contact.includes("@") ? input.contact.toLowerCase() : input.contact.replace(/[ ()-]/g, "");
      if (containsSecret(contact)) throw new HistoryError("Укажите только телефон или email.");
      const recent = { organizationId: owner.organizationId, source: "WEBSITE" as const, createdByUserId: null, createdAt: { gte: new Date(Date.now()-3600000) } };
      // Use the same lock as the existing website inquiry writer for shared quotas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`showroom:${owner.organizationId}`},0))`;
      if (await tx.inquiry.count({where:recent}) >= 30 || await tx.inquiry.count({where:{...recent,replyContact:contact}}) >= 3) throw new HistoryError("Слишком много обращений. Попробуйте позже.",429);
      const ids = [...new Set(Object.values(snapshot.context?.selected ?? {}).filter((id): id is string => Boolean(id)))];
      const selected = await tx.productVariant.findMany({where:{AND:[variantOperationWhere(owner.organizationId,"RENTAL",true),{id:{in:ids}}]},select:{id:true,sku:true,product:{select:{name:true}},execution:{select:{name:true}},size:{select:{name:true,code:true}}}});
      const inquiry = await createInquiryRecord(tx,{organizationId:owner.organizationId,branchId:snapshot.branchId,source:"WEBSITE",createdByUserId:null,subject:"Подбор с сайта — передан сотруднику",replyContact:contact,requestText:handoffPreferences(snapshot.context),requestedFrom,requestedUntil,requestedSize:selected.map(v=>v.size.name||v.size.code).join(" / ").slice(0,100)||null,creationKey:input.key,creationHash:digest([owner,current.id,input]),items:{create:selected.map(v=>({organizationId:owner.organizationId,productVariantId:v.id,nameSnapshot:v.product.name+(v.execution?` · ${v.execution.name}`:""),skuSnapshot:v.sku,sizeSnapshot:v.size.name||v.size.code}))}}, {source:"API",itemCount:selected.length});
      await tx.$executeRaw`UPDATE assistant_conversations SET inquiry_id=${inquiry.id}::uuid,handoff_key=${input.key}::uuid,handoff_hash=${digest(input)},handed_off_at=now(),version=version+1 WHERE id=${current.id}::uuid`;
    }
    if (pilotTestRequested()) await requirePilotWindow(tx);
    if (ownerMainRestricted()) await requireOwnerDayWriteWindow(tx);
    return view((await row(tx,owner))!);
  },{timeout:10000});
}
export async function revokeHistory(owner: HistoryOwner) {
  if (ownerMainRestricted()) throw new HistoryError("Удаление записей владельческого теста отдельно не разрешено.", 403);
  if (pilotTestRequested()) throw new PilotTestError('Удаление записей в тесте отключено. Audit сохраняется.');
  await gate(owner); // Idempotent; do not charge revocation against write quotas.
  await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`history:${owner.organizationId}`},0))`; await tx.$executeRaw`DELETE FROM assistant_conversations WHERE organization_id=${owner.organizationId}::uuid AND owner_hash=${owner.ownerHash} AND principal=${owner.principal} AND channel='WEB'`;});
}
export async function inquiryConversation(session: AuthContext, inquiryId: string) {
  if (ownerMainRestricted()) {
    try { const owner = await requireOwnerDaySession(["LEAD_VIEW"]); if (owner.sessionId !== session.sessionId) return null; }
    catch { return null; }
  }
  if (pilotTestRequested()) { try { assertPilotSession(session); const window = await pilotWindow(); if (window.status !== 'active' || window.inquiryHref !== `/chats/${inquiryId}`) return null; } catch { return null; } }
  if (!historyEnabled(session.organizationId) || !await getInquiry(session,inquiryId)) return null;
  const rows=await db.$queryRaw<{id:string;expires_at:Date}[]>`SELECT id,expires_at FROM assistant_conversations WHERE organization_id=${session.organizationId}::uuid AND inquiry_id=${inquiryId}::uuid AND channel='WEB' AND expires_at>now()`;
  if(!rows[0])return null;
  const messages=await db.$queryRaw<Message[]>`SELECT role,content FROM assistant_messages WHERE conversation_id=${rows[0].id}::uuid ORDER BY ordinal`;
  return {messages,expiresAt:rows[0].expires_at};
}
// No route/cron is installed. Operator schedules only after a separate release decision.
// Dry-run by default; database clock and fixed batch bound prevent arbitrary deletion.
export async function retentionBatch(apply = false) {
  // No global maintenance across tenants in the isolated candidate.
  if (isolatedPreviewRequested() || pilotTestRequested() || ownerMainRestricted()) throw new HistoryError('Retention is not enabled in this isolated Preview.', 503);
  await gate(); const rows=await db.$queryRaw<{id:string}[]>`SELECT id FROM assistant_conversations WHERE expires_at<=now() ORDER BY expires_at LIMIT 100`;
  if(apply)await db.$transaction(async tx=>{for(const value of rows)await tx.$executeRaw`DELETE FROM assistant_conversations WHERE id=${value.id}::uuid AND expires_at<=now()`; await tx.$executeRaw`DELETE FROM assistant_history_quotas WHERE window_start<now()-interval '2 hours'`;});
  return {eligible:rows.length,deleted:apply?rows.length:0,retentionDays:HISTORY_DAYS};
}
