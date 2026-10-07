import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";
import type { PermissionKey } from "@/lib/permissions/registry";
import { workflowScope, permits } from "@/lib/workflow-access";
import { appendAuditLog } from "@/lib/audit/log";
import { localDateKey, parseDateKey } from "@/lib/calendar/timezone";
import { paymentChannel } from "@/lib/finance/payment-channel";

type Tx = Prisma.TransactionClient;
const uuid = z.string().uuid(), amount = z.string().trim().regex(/^[1-9]\d{0,11}$/, "Укажите положительную целую сумму до 12 цифр.");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const CLAIM_LABELS = { SUBMITTED: "Ждёт подтверждения", APPROVED: "Смена и выплата подтверждены", REJECTED: "Отклонена", REVERSED: "Исправлена обратными записями" } as const;
export const PAYROLL_LABELS: Record<string, string> = { PAYROLL_SHIFT: "Начислено за смену", PAYROLL_BONUS: "Начислена премия", PAYROLL_PAYOUT: "Записана выплата", REVERSAL: "Исправление" };
const isManager = (role: string) => role === "OWNER" || role === "DIRECTOR";
async function access(tx: Tx, actor: AuthContext, branchId?: string, keys: PermissionKey[] = [], manager = true) {
  const scope = await workflowScope(tx, actor, manager ? ["FINANCE_DASHBOARD_VIEW", ...keys] : ["SHIFT_VIEW"], branchId);
  if (manager && !isManager(scope.member.role)) throw Error("Зарплатный учёт доступен владельцу или директору.");
  return scope;
}
async function employee(tx: Tx, actor: AuthContext, branchId: string, membershipId: string, active = true) {
  const row = await tx.organizationMembership.findFirst({ where: { id: membershipId, organizationId: actor.organizationId,
    ...(active ? { status: "ACTIVE", user: { status: "ACTIVE" } } : {}),
    OR: [{ role: "OWNER" }, { branchAccess: { some: { organizationId: actor.organizationId, branchId } } }] }, select: { id: true, user: { select: { displayName: true } } } });
  if (!row) throw Error("Сотрудник недоступен в этом филиале.");
  return row;
}
async function lock(tx: Tx, actor: AuthContext, membershipId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId + ":payroll:" + membershipId},0))`;
}
function workDate(value: string) {
  const parsed = parseDateKey(value);
  if (!parsed || parsed.year < 2000) throw Error("Проверьте дату отработанной смены.");
  return new Date(value + "T00:00:00.000Z");
}
function dayClass(date: Date) { return [0, 6].includes(date.getUTCDay()) ? "WEEKEND" : "WEEKDAY"; }
async function audit(tx: Tx, actor: AuthContext, branchId: string, action: string, entityType: string, entityId: string) {
  // Do not copy salary amounts, rate snapshots or free-text reasons into the general audit feed.
  await appendAuditLog(tx, { organizationId: actor.organizationId, branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action, entityType, entityId });
}
export async function ownClaims(actor: AuthContext) {
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, undefined, [], false);
    const [branches, claims] = await Promise.all([
      tx.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", id: scope.where.branchId }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } }),
      tx.payrollClaim.findMany({ where: { ...scope.where, employeeMembershipId: actor.membershipId, branch: { status: "ACTIVE" } },
        select: { id: true, workDate: true, status: true, decisionReason: true, branch: { select: { name: true } } }, orderBy: [{ workDate: "desc" }, { id: "desc" }], take: 100 }),
    ]);
    return { branches, claims };
  });
}
export async function submitClaim(actor: AuthContext, raw: unknown) {
  const input = z.object({ branchId: uuid, workDate: z.string(), creationKey: uuid, standardShift: z.literal("yes") }).parse(raw);
  const date = workDate(input.workDate);
  return db.$transaction(async tx => {
    await access(tx, actor, input.branchId, [], false);
    await lock(tx, actor, actor.membershipId);
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: input.branchId }, select: { timezone: true } });
    if (input.workDate > localDateKey(new Date(), branch.timezone)) throw Error("Нельзя отметить будущую смену.");
    const payloadHash = hash({ branchId: input.branchId, workDate: input.workDate, employee: actor.membershipId });
    const replay = await tx.payrollClaim.findUnique({ where: { organizationId_creationKey: { organizationId: actor.organizationId, creationKey: input.creationKey } } });
    if (replay) { if (replay.creationHash !== payloadHash || replay.employeeMembershipId !== actor.membershipId) throw Error("Повторный запрос отличается от исходного."); return replay.id; }
    if (await tx.payrollClaim.findFirst({ where: { organizationId: actor.organizationId, employeeMembershipId: actor.membershipId, workDate: date, status: { in: ["SUBMITTED", "APPROVED"] } }, select: { id: true } })) throw Error("За эту дату уже есть отметка. Откройте её статус ниже.");
    const row = await tx.payrollClaim.create({ data: { organizationId: actor.organizationId, branchId: input.branchId, employeeMembershipId: actor.membershipId, workDate: date, timezone: branch.timezone, creationKey: input.creationKey, creationHash: payloadHash } });
    await audit(tx, actor, row.branchId, "PAYROLL_CLAIM_SUBMITTED", "PayrollClaim", row.id);
    return row.id;
  });
}
export async function saveRate(actor: AuthContext, raw: unknown) {
  const input = z.object({ branchId: uuid, employeeMembershipId: uuid, weekdayMinor: amount, weekendMinor: amount, version: z.number().int().nonnegative() }).parse(raw);
  return db.$transaction(async tx => {
    await access(tx, actor, input.branchId, ["STAFF_EDIT"]);
    await employee(tx, actor, input.branchId, input.employeeMembershipId);
    await lock(tx, actor, input.employeeMembershipId);
    const key = { organizationId: actor.organizationId, branchId: input.branchId, employeeMembershipId: input.employeeMembershipId };
    const old = await tx.payrollRate.findUnique({ where: { organizationId_branchId_employeeMembershipId: key } });
    const currency = (await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { defaultCurrency: true } })).defaultCurrency;
    const data = { weekdayMinor: BigInt(input.weekdayMinor), weekendMinor: BigInt(input.weekendMinor), currency };
    if (old && old.weekdayMinor === data.weekdayMinor && old.weekendMinor === data.weekendMinor && old.currency === currency) return old.id;
    if ((old?.version ?? 0) !== input.version) throw Error("Ставка уже изменена. Обновите страницу.");
    const row = old ? await tx.payrollRate.update({ where: { id: old.id }, data: { ...data, version: { increment: 1 } } }) : await tx.payrollRate.create({ data: { ...key, ...data } });
    await audit(tx, actor, input.branchId, "PAYROLL_RATE_SAVED", "PayrollRate", row.id);
    return row.id;
  });
}
async function method(tx: Tx, actor: AuthContext, id: string) {
  const row = await tx.paymentMethod.findFirst({ where: { id, organizationId: actor.organizationId, isActive: true }, select: { id: true, code: true, displayName: true } });
  if (!row || paymentChannel(row.code) === "OTHER") throw Error("Выберите активный наличный или безналичный способ выплаты.");
  return row;
}
async function balance(tx: Tx, actor: AuthContext, branchId: string, membershipId: string, currency: string) {
  const sum = await tx.financialTransaction.aggregate({ where: { organizationId: actor.organizationId, branchId, employeeMembershipId: membershipId, currency }, _sum: { payrollAccruedMinor: true, payrollPaidMinor: true } });
  return (sum._sum.payrollAccruedMinor ?? BigInt(0)) - (sum._sum.payrollPaidMinor ?? BigInt(0));
}
type Posting = { branchId: string; employeeMembershipId: string; currency: string; amount: bigint; kind: "PAYROLL_SHIFT" | "PAYROLL_BONUS" | "PAYROLL_PAYOUT";
  key: string; sourceId?: string; reason: string; paymentMethodId?: string; snapshot: Prisma.InputJsonObject };
async function post(tx: Tx, actor: AuthContext, input: Posting) {
  return tx.financialTransaction.create({ data: { organizationId: actor.organizationId, branchId: input.branchId, employeeMembershipId: input.employeeMembershipId,
    currency: input.currency, kind: input.kind, amountMinor: input.amount, payrollAccruedMinor: input.kind === "PAYROLL_PAYOUT" ? BigInt(0) : input.amount,
    payrollPaidMinor: input.kind === "PAYROLL_PAYOUT" ? input.amount : BigInt(0), obligationEffectMinor: BigInt(0), cashEffectMinor: BigInt(0), revenueEffectMinor: BigInt(0), depositEffectMinor: BigInt(0),
    idempotencyKey: input.key, sourceType: input.sourceId ? "PAYROLL_SHIFT_CONFIRMATION" : "PAYROLL_MANUAL", sourceId: input.sourceId,
    reason: input.reason, paymentMethodId: input.paymentMethodId, payrollSnapshot: input.snapshot, actorUserId: actor.userId, actorMembershipId: actor.membershipId } });
}
export async function confirmClaimAndPayment(actor: AuthContext, raw: unknown) {
  const input = z.object({ id: uuid, version: z.number().int().positive(), rateVersion: z.number().int().positive(), paymentMethodId: uuid, idempotencyKey: uuid, confirmed: z.literal("yes") }).parse(raw);
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, undefined, ["SHIFT_MANAGE", "PAYMENT_CREATE"]);
    const initial = await tx.payrollClaim.findFirst({ where: { ...scope.where, id: input.id } });
    if (!initial) throw Error("Отметка недоступна.");
    await access(tx, actor, initial.branchId, ["SHIFT_MANAGE", "PAYMENT_CREATE"]);
    await lock(tx, actor, initial.employeeMembershipId);
    const claim = await tx.payrollClaim.findUniqueOrThrow({ where: { id: initial.id } });
    const payloadHash = hash({ id: input.id, paymentMethodId: input.paymentMethodId, rateVersion: input.rateVersion, approver: actor.membershipId });
    if (claim.confirmationKey === input.idempotencyKey) { if (claim.confirmationHash !== payloadHash) throw Error("Повторное подтверждение отличается от исходного."); return claim.id; }
    if (claim.status !== "SUBMITTED" || claim.version !== input.version) throw Error("Отметка уже обработана. Обновите страницу; повторной выплаты нет.");
    await employee(tx, actor, claim.branchId, claim.employeeMembershipId);
    const rate = await tx.payrollRate.findUnique({ where: { organizationId_branchId_employeeMembershipId: { organizationId: actor.organizationId, branchId: claim.branchId, employeeMembershipId: claim.employeeMembershipId } } });
    if (!rate || rate.version !== input.rateVersion) throw Error("Ставка не задана или изменилась. Проверьте новую сумму после обновления страницы.");
    const paidBy = await method(tx, actor, input.paymentMethodId), category = dayClass(claim.workDate), value = category === "WEEKEND" ? rate.weekendMinor : rate.weekdayMinor;
    const now = new Date();
    const snapshot = { workDate: claim.workDate.toISOString().slice(0, 10), timezone: claim.timezone, category, rateId: rate.id, rateVersion: rate.version,
      rateMinor: value.toString(), currency: rate.currency, claimId: claim.id, paymentMethodId: paidBy.id, paymentMethodName: paidBy.displayName,
      approverMembershipId: actor.membershipId, approvedAt: now.toISOString(), basis: "EMPLOYEE_REPORTED_FULL_STANDARD_SHIFT" };
    const common = { branchId: claim.branchId, employeeMembershipId: claim.employeeMembershipId, currency: rate.currency, amount: value, sourceId: claim.id, snapshot, reason: "Подтверждённая отработанная смена" };
    const accrued = await post(tx, actor, { ...common, kind: "PAYROLL_SHIFT", key: `payroll-shift:${input.idempotencyKey}:accrual` });
    const payout = await post(tx, actor, { ...common, kind: "PAYROLL_PAYOUT", key: `payroll-shift:${input.idempotencyKey}:payment`, paymentMethodId: paidBy.id });
    await tx.payrollClaim.update({ where: { id: claim.id }, data: { status: "APPROVED", version: { increment: 1 }, reviewedByUserId: actor.userId, reviewedAt: now,
      confirmationKey: input.idempotencyKey, confirmationHash: payloadHash, accrualTransactionId: accrued.id, payoutTransactionId: payout.id, approvalSnapshot: snapshot } });
    await audit(tx, actor, claim.branchId, "PAYROLL_SHIFT_AND_PAYMENT_CONFIRMED", "PayrollClaim", claim.id);
    return claim.id;
  }, { maxWait: 10000, timeout: 20000 });
}
export async function rejectClaim(actor: AuthContext, raw: unknown) {
  const input = z.object({ id: uuid, version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }).parse(raw);
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, undefined, ["SHIFT_MANAGE"]);
    const row = await tx.payrollClaim.findFirst({ where: { ...scope.where, id: input.id, branch: { status: "ACTIVE" } } });
    if (!row) throw Error("Отметка недоступна.");
    await lock(tx, actor, row.employeeMembershipId);
    const current = await tx.payrollClaim.findUniqueOrThrow({ where: { id: row.id } });
    if (current.status === "REJECTED" && current.decisionReason === input.reason) return current.id;
    if (current.status !== "SUBMITTED" || current.version !== input.version) throw Error("Отметка уже обработана.");
    await tx.payrollClaim.update({ where: { id: row.id }, data: { status: "REJECTED", version: { increment: 1 }, decisionReason: input.reason, reviewedAt: new Date(), reviewedByUserId: actor.userId } });
    await audit(tx, actor, row.branchId, "PAYROLL_CLAIM_REJECTED", "PayrollClaim", row.id); return row.id;
  });
}
export async function manualPayroll(actor: AuthContext, raw: unknown) {
  const input = z.object({ branchId: uuid, employeeMembershipId: uuid, kind: z.enum(["PAYROLL_BONUS", "PAYROLL_PAYOUT"]), amountMinor: amount,
    currency: z.string().regex(/^[A-Z]{3}$/), reason: z.string().trim().min(3).max(500), paymentMethodId: uuid.optional(), idempotencyKey: uuid, confirmed: z.literal("yes") }).parse(raw);
  return db.$transaction(async tx => {
    await access(tx, actor, input.branchId, ["PAYMENT_CREATE"]);
    await employee(tx, actor, input.branchId, input.employeeMembershipId, false); await lock(tx, actor, input.employeeMembershipId);
    const key = "payroll-manual:" + input.idempotencyKey, payloadHash = hash(input);
    const replay = await tx.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: key } } });
    if (replay) { if ((replay.payrollSnapshot as { payloadHash?: string })?.payloadHash !== payloadHash || replay.actorMembershipId !== actor.membershipId) throw Error("Повторная операция отличается от исходной."); return replay.id; }
    const value = BigInt(input.amountMinor);
    if (input.kind === "PAYROLL_PAYOUT" && value > await balance(tx, actor, input.branchId, input.employeeMembershipId, input.currency)) throw Error("Выплата превышает остаток начисленной зарплаты.");
    if (input.kind === "PAYROLL_BONUS") { const currency = (await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { defaultCurrency: true } })).defaultCurrency; if (input.currency !== currency || input.paymentMethodId) throw Error("Премию начисляют в валюте организации без способа выплаты."); }
    const paidBy = input.kind === "PAYROLL_PAYOUT" ? await method(tx, actor, uuid.parse(input.paymentMethodId)) : null;
    const result = await post(tx, actor, { branchId: input.branchId, employeeMembershipId: input.employeeMembershipId, amount: value, currency: input.currency, kind: input.kind, reason: input.reason, paymentMethodId: paidBy?.id, key,
      snapshot: { payloadHash, basis: input.kind === "PAYROLL_BONUS" ? "APPROVED_BONUS" : "RECORDED_PAYMENT_NO_BANK_TRANSFER", paymentMethodName: paidBy?.displayName ?? null } });
    await audit(tx, actor, input.branchId, input.kind === "PAYROLL_BONUS" ? "PAYROLL_BONUS_POSTED" : "PAYROLL_PAYMENT_POSTED", "FinancialTransaction", result.id); return result.id;
  });
}
async function reverseEntry(tx: Tx, actor: AuthContext, original: Awaited<ReturnType<Tx["financialTransaction"]["findUniqueOrThrow"]>>, key: string, reason: string) {
  return tx.financialTransaction.create({ data: { organizationId: actor.organizationId, branchId: original.branchId, employeeMembershipId: original.employeeMembershipId,
    kind: "REVERSAL", amountMinor: original.amountMinor, currency: original.currency, payrollAccruedMinor: -original.payrollAccruedMinor, payrollPaidMinor: -original.payrollPaidMinor,
    obligationEffectMinor: BigInt(0), cashEffectMinor: BigInt(0), revenueEffectMinor: BigInt(0), depositEffectMinor: BigInt(0), paymentMethodId: original.paymentMethodId,
    reversalOfId: original.id, sourceType: "PAYROLL_CORRECTION", sourceId: original.sourceId, idempotencyKey: key, reason,
    payrollSnapshot: original.payrollSnapshot as Prisma.InputJsonObject, actorUserId: actor.userId, actorMembershipId: actor.membershipId } });
}
export async function correctPayroll(actor: AuthContext, raw: unknown) {
  const input = z.object({ transactionId: uuid, idempotencyKey: uuid, reason: z.string().trim().min(3).max(500), confirmed: z.literal("yes") }).parse(raw);
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, undefined, ["PAYMENT_REVERSE"]);
    const original = await tx.financialTransaction.findFirst({ where: { ...scope.where, id: input.transactionId, employeeMembershipId: { not: null }, kind: { not: "REVERSAL" }, branch: { status: "ACTIVE" } } });
    if (!original?.employeeMembershipId) throw Error("Зарплатная запись недоступна.");
    await lock(tx, actor, original.employeeMembershipId);
    const existing = await tx.financialTransaction.findUnique({ where: { reversalOfId: original.id } });
    if (existing) return existing.id;
    let result: string;
    if (original.sourceType === "PAYROLL_SHIFT_CONFIRMATION") {
      const claim = await tx.payrollClaim.findFirst({ where: { ...scope.where, id: original.sourceId!, status: "APPROVED" } });
      if (!claim?.accrualTransactionId || !claim.payoutTransactionId) throw Error("Подтверждение смены недоступно.");
      const [accrued, paid] = await Promise.all([tx.financialTransaction.findUniqueOrThrow({ where: { id: claim.accrualTransactionId } }), tx.financialTransaction.findUniqueOrThrow({ where: { id: claim.payoutTransactionId } })]);
      await reverseEntry(tx, actor, paid, `payroll-correction:${input.idempotencyKey}:payment`, input.reason);
      result = (await reverseEntry(tx, actor, accrued, `payroll-correction:${input.idempotencyKey}:accrual`, input.reason)).id;
      await tx.payrollClaim.update({ where: { id: claim.id }, data: { status: "REVERSED", version: { increment: 1 }, decisionReason: input.reason } });
    } else {
      if (original.payrollAccruedMinor > await balance(tx, actor, original.branchId, original.employeeMembershipId, original.currency)) throw Error("Сначала исправьте связанные записи о выплате: начисление уже выплачено.");
      result = (await reverseEntry(tx, actor, original, "payroll-correction:" + input.idempotencyKey, input.reason)).id;
    }
    await audit(tx, actor, original.branchId, "PAYROLL_CORRECTED", "FinancialTransaction", original.id); return result;
  }, { maxWait: 10000, timeout: 20000 });
}

export async function payrollView(actor: AuthContext, raw: { branchId?: string; employeeMembershipId?: string; all?: string; page?: string }) {
  if (raw.branchId) uuid.parse(raw.branchId);
  if (raw.employeeMembershipId) uuid.parse(raw.employeeMembershipId);
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, raw.branchId);
    const branches = await tx.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", id: scope.where.branchId }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } });
    const branch = branches.find(b => b.id === (raw.branchId || actor.defaultBranchId)) ?? branches[0];
    if (!branch) throw Error("Нет доступного активного филиала.");
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { defaultCurrency: true } });
    const members = await tx.organizationMembership.findMany({ where: { organizationId: actor.organizationId, OR: [{ role: "OWNER" }, { branchAccess: { some: { organizationId: actor.organizationId, branchId: branch.id } } }, { payrollClaims: { some: { branchId: branch.id } } }, { payrollTransactions: { some: { branchId: branch.id } } }] },
      select: { id: true, status: true, user: { select: { displayName: true } } }, orderBy: { user: { displayName: "asc" } } });
    const selected = raw.employeeMembershipId ? members.find(m => m.id === raw.employeeMembershipId) : null;
    if (raw.employeeMembershipId && !selected) throw Error("Сотрудник недоступен.");
    const page = /^\d{1,5}$/.test(raw.page ?? "") ? Math.max(1, Number(raw.page)) : 1;
    const base = { organizationId: actor.organizationId, branchId: branch.id };
    const [rates, methods, claims, sums, ledger] = await Promise.all([
      tx.payrollRate.findMany({ where: base }),
      tx.paymentMethod.findMany({ where: { organizationId: actor.organizationId, isActive: true, code: { in: ["CASH", "KASPI", "BANK_CARD", "BANK_TRANSFER"] } }, select: { id: true, code: true, displayName: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      tx.payrollClaim.findMany({ where: { ...base, employeeMembershipId: selected?.id, ...(raw.all === "yes" ? {} : { status: "SUBMITTED" }) },
        include: { employee: { select: { user: { select: { displayName: true } } } } }, orderBy: [{ workDate: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 51 }),
      selected ? tx.financialTransaction.groupBy({ by: ["currency"], where: { ...base, employeeMembershipId: selected.id }, _sum: { payrollAccruedMinor: true, payrollPaidMinor: true }, orderBy: { currency: "asc" } }) : [],
      selected ? tx.financialTransaction.findMany({ where: { ...base, employeeMembershipId: selected.id }, select: { id: true, kind: true, amountMinor: true, currency: true, payrollAccruedMinor: true, payrollPaidMinor: true, payrollSnapshot: true,
        occurredAt: true, reason: true, sourceType: true, reversal: { select: { id: true } }, paymentMethod: { select: { displayName: true } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 100 }) : [],
    ]);
    return { branches, branch, members, selected, methods, currency: organization.defaultCurrency, rate: rates.find(r => r.employeeMembershipId === selected?.id) ?? null,
      canRate: permits(scope.member, "STAFF_EDIT"), canConfirm: permits(scope.member, "SHIFT_MANAGE") && permits(scope.member, "PAYMENT_CREATE"), canReject: permits(scope.member, "SHIFT_MANAGE"), canPost: permits(scope.member, "PAYMENT_CREATE"), canReverse: permits(scope.member, "PAYMENT_REVERSE"),
      claims: claims.slice(0, 50).map(claim => { const rate = rates.find(r => r.employeeMembershipId === claim.employeeMembershipId); const category = dayClass(claim.workDate); return { ...claim, category, currentRateVersion: rate?.version ?? null, previewAmount: rate ? (category === "WEEKEND" ? rate.weekendMinor : rate.weekdayMinor) : null, previewCurrency: rate?.currency ?? null }; }),
      more: claims.length > 50, page, ledger, balances: sums.map(row => ({ currency: row.currency, accrued: row._sum.payrollAccruedMinor ?? BigInt(0), paid: row._sum.payrollPaidMinor ?? BigInt(0), due: (row._sum.payrollAccruedMinor ?? BigInt(0)) - (row._sum.payrollPaidMinor ?? BigInt(0)) })) };
  });
}
