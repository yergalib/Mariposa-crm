import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma, type FinancialTransaction } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { workflowScope, permits } from "@/lib/workflow-access";
import type { PermissionKey } from "@/lib/permissions/registry";
import { appendAuditLog } from "@/lib/audit/log";

type Tx = Prisma.TransactionClient;
type Actor = Pick<AuthContext, "organizationId" | "membershipId" | "userId">;
const uuid = z.string().uuid(), positive = z.string().trim().regex(/^[1-9]\d{0,11}$/, "Введите положительную целую сумму KZT."), amount = z.string().trim().regex(/^(0|[1-9]\d{0,11})$/, "Введите неотрицательный остаток KZT.");
const reason = z.string().trim().min(3, "Укажите основание (не менее 3 символов).").max(500);
const commandFields = { idempotencyKey: uuid, reason, confirmed: z.literal(true, { error: "Подтвердите фактическое движение или исправление учёта." }) };
export const ACCOUNT_LABELS = { CASH: "Наличные", NON_CASH: "Безналичные" } as const;
export const ACCOUNT_OPERATION_LABELS: Partial<Record<FinancialTransaction["kind"], string>> = { CASH_OPENING: "Начальный остаток", CASH_EXPENSE: "Расход", CASH_TRANSFER_OUT: "Перевод со счёта", CASH_TRANSFER_IN: "Перевод на счёт", PAYMENT_RECEIVED: "Оплата заказа", CUSTOMER_REFUND: "Возврат оплаты", DEPOSIT_RECEIVED: "Приём залога", DEPOSIT_REFUNDED: "Возврат залога", PAYROLL_PAYOUT: "Выплата сотруднику", REVERSAL: "Исправление" };
const nativeKinds = ["CASH_OPENING", "CASH_EXPENSE", "CASH_TRANSFER_OUT", "CASH_TRANSFER_IN"] as const;
function operationId(organizationId: string, input: unknown) {
  const hex = createHash("sha256").update(organizationId + ":cash:" + JSON.stringify(input)).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
async function access(tx: Tx, actor: Actor, key?: PermissionKey, branchId?: string) {
  return workflowScope(tx, actor, ["CASH_ACCOUNT_VIEW", ...(key ? [key] : [])], branchId);
}
async function lockBranches(tx: Tx, organizationId: string, ids: string[]) {
  for (const branchId of [...new Set(ids)].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ":cash-branch:" + branchId},0))`;
}
async function lockAccounts(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT id FROM cash_accounts WHERE id=${id}::uuid FOR UPDATE`;
}
async function account(tx: Tx, actor: Actor, id: string, key: PermissionKey) {
  const row = await tx.cashAccount.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!row) throw Error("Касса недоступна.");
  await access(tx, actor, key, row.branchId);
  return row;
}
async function replay(tx: Tx, actor: Actor, key: string, sourceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId + ":cash-command:" + key},0))`;
  const row = await tx.financialTransaction.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: key } } });
  if (row && row.sourceId !== sourceId) throw Error("Ключ операции уже использован с другими данными.");
  return row;
}
async function audit(tx: Tx, actor: Actor, row: FinancialTransaction, action: string) {
  await appendAuditLog(tx, { organizationId: actor.organizationId, branchId: row.branchId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action, entityType: "FinancialTransaction", entityId: row.id, metadata: { kind: row.kind, amountMinor: row.amountMinor.toString(), currency: row.currency, sourceType: row.sourceType, reversalOfId: row.reversalOfId, cashAccountId: row.cashAccountId, expenseCategoryId: row.expenseCategoryId, reason: row.reason } });
}
async function post(tx: Tx, actor: Actor, input: { accountId: string; branchId: string; kind: typeof nativeKinds[number]; amountMinor: bigint; sourceType: string; sourceId: string; idempotencyKey: string; reason: string; expenseCategoryId?: string; expenseCategoryName?: string }) {
  const outgoing = input.kind === "CASH_EXPENSE" || input.kind === "CASH_TRANSFER_OUT";
  const row = await tx.financialTransaction.create({ data: { organizationId: actor.organizationId, branchId: input.branchId, cashAccountId: input.accountId, kind: input.kind, amountMinor: input.amountMinor, accountEffectMinor: outgoing ? -input.amountMinor : input.amountMinor, cashEffectMinor: input.kind === "CASH_EXPENSE" ? -input.amountMinor : BigInt(0), obligationEffectMinor: BigInt(0), revenueEffectMinor: BigInt(0), depositEffectMinor: BigInt(0), currency: "KZT", sourceType: input.sourceType, sourceId: input.sourceId, idempotencyKey: input.idempotencyKey, reason: input.reason, expenseCategoryId: input.expenseCategoryId, expenseCategoryName: input.expenseCategoryName, actorUserId: actor.userId, actorMembershipId: actor.membershipId } });
  await audit(tx, actor, row, "CASH_MOVEMENT_POSTED");
  return row;
}
async function reverse(tx: Tx, actor: Actor, original: FinancialTransaction, input: { sourceType: string; sourceId: string; idempotencyKey: string; reason: string }) {
  const row = await tx.financialTransaction.create({ data: { organizationId: actor.organizationId, branchId: original.branchId, kind: "REVERSAL", amountMinor: original.amountMinor, cashAccountId: original.cashAccountId, accountEffectMinor: -original.accountEffectMinor, cashEffectMinor: -original.cashEffectMinor, obligationEffectMinor: -original.obligationEffectMinor, revenueEffectMinor: -original.revenueEffectMinor, depositEffectMinor: -original.depositEffectMinor, currency: original.currency, reversalOfId: original.id, sourceType: input.sourceType, sourceId: input.sourceId, idempotencyKey: input.idempotencyKey, reason: input.reason, actorUserId: actor.userId, actorMembershipId: actor.membershipId } });
  await audit(tx, actor, row, "CASH_MOVEMENT_REVERSED");
  return row;
}
export async function setCashOpening(actor: Actor, raw: unknown) {
  const input = z.object({ ...commandFields, branchId: uuid, kind: z.enum(["CASH", "NON_CASH"]), amountMinor: amount, replacesOpeningId: uuid.optional() }).parse(raw);
  const sourceId = operationId(actor.organizationId, { command: "opening", ...input });
  return db.$transaction(async tx => {
    await access(tx, actor, "CASH_ACCOUNT_MANAGE", input.branchId);
    const previous = await replay(tx, actor, input.idempotencyKey, sourceId); if (previous) return previous.cashAccountId!;
    await lockBranches(tx, actor.organizationId, [input.branchId]);
    const acct = await tx.cashAccount.upsert({ where: { organizationId_branchId_kind: { organizationId: actor.organizationId, branchId: input.branchId, kind: input.kind } }, create: { organizationId: actor.organizationId, branchId: input.branchId, kind: input.kind, currency: "KZT" }, update: {} });
    await lockAccounts(tx, [acct.id]);
    const opening = await tx.financialTransaction.findFirst({ where: { organizationId: actor.organizationId, cashAccountId: acct.id, kind: "CASH_OPENING", reversal: null } });
    if (opening?.id !== input.replacesOpeningId) throw Error("Начальный остаток уже задан или изменён. Обновите страницу.");
    if (opening) await reverse(tx, actor, opening, { sourceType: "CASH_OPENING_REPLACEMENT", sourceId, idempotencyKey: input.idempotencyKey, reason: input.reason });
    await post(tx, actor, { accountId: acct.id, branchId: acct.branchId, kind: "CASH_OPENING", amountMinor: BigInt(input.amountMinor), sourceType: opening ? "CASH_OPENING_REPLACEMENT" : "CASH_OPENING", sourceId, idempotencyKey: opening ? input.idempotencyKey + ":open" : input.idempotencyKey, reason: input.reason });
    return acct.id;
  });
}
export async function createCashExpense(actor: Actor, raw: unknown) {
  const input = z.object({ ...commandFields, accountId: uuid, categoryId: uuid, amountMinor: positive }).parse(raw), sourceId = operationId(actor.organizationId, { command: "expense", ...input });
  return db.$transaction(async tx => {
    const acct = await account(tx, actor, input.accountId, "CASH_EXPENSE_CREATE");
    const old = await replay(tx, actor, input.idempotencyKey, sourceId); if (old) return old.id;
    await lockBranches(tx, actor.organizationId, [acct.branchId]); await lockAccounts(tx, [acct.id]);
    const category = await tx.expenseCategory.findFirst({ where: { id: input.categoryId, organizationId: actor.organizationId, isActive: true } });
    if (!category) throw Error("Категория расходов недоступна.");
    const row = await post(tx, actor, { accountId: acct.id, branchId: acct.branchId, kind: "CASH_EXPENSE", amountMinor: BigInt(input.amountMinor), expenseCategoryId: category.id, expenseCategoryName: category.name, sourceType: "CASH_EXPENSE", sourceId, idempotencyKey: input.idempotencyKey, reason: input.reason });
    return row.id;
  });
}
export async function transferCash(actor: Actor, raw: unknown) {
  const input = z.object({ ...commandFields, fromAccountId: uuid, toAccountId: uuid, amountMinor: positive }).parse(raw), sourceId = operationId(actor.organizationId, { command: "transfer", ...input });
  if (input.fromAccountId === input.toAccountId) throw Error("Выберите разные кассы.");
  return db.$transaction(async tx => {
    const from = await account(tx, actor, input.fromAccountId, "CASH_TRANSFER_CREATE"), to = await account(tx, actor, input.toAccountId, "CASH_TRANSFER_CREATE");
    const old = await replay(tx, actor, input.idempotencyKey, sourceId); if (old) return old.id;
    await lockBranches(tx, actor.organizationId, [from.branchId, to.branchId]); await lockAccounts(tx, [from.id, to.id]);
    const common = { amountMinor: BigInt(input.amountMinor), sourceType: "CASH_TRANSFER", sourceId, reason: input.reason };
    const row = await post(tx, actor, { ...common, accountId: from.id, branchId: from.branchId, kind: "CASH_TRANSFER_OUT", idempotencyKey: input.idempotencyKey });
    await post(tx, actor, { ...common, accountId: to.id, branchId: to.branchId, kind: "CASH_TRANSFER_IN", idempotencyKey: input.idempotencyKey + ":in" });
    return row.id;
  });
}
export async function correctCashMovement(actor: Actor, raw: unknown) {
  const input = z.object({ ...commandFields, transactionId: uuid }).parse(raw), sourceId = operationId(actor.organizationId, { command: "correction", ...input });
  return db.$transaction(async tx => {
    await access(tx, actor, "CASH_CORRECT");
    const original = await tx.financialTransaction.findFirst({ where: { id: input.transactionId, organizationId: actor.organizationId, kind: { in: ["CASH_EXPENSE", "CASH_TRANSFER_OUT", "CASH_TRANSFER_IN"] } } });
    if (!original?.cashAccountId) throw Error("Запись недоступна для исправления. Платежи, залоги и зарплата исправляются в своих разделах.");
    const legs = original.kind === "CASH_EXPENSE" ? [original] : await tx.financialTransaction.findMany({ where: { organizationId: actor.organizationId, sourceType: "CASH_TRANSFER", sourceId: original.sourceId }, orderBy: { id: "asc" } });
    if (legs.length !== (original.kind === "CASH_EXPENSE" ? 1 : 2)) throw Error("Перевод не имеет полной пары записей.");
    for (const leg of legs) await access(tx, actor, "CASH_CORRECT", leg.branchId);
    const old = await replay(tx, actor, input.idempotencyKey, sourceId); if (old) return old.id;
    await lockBranches(tx, actor.organizationId, legs.map(row => row.branchId)); await lockAccounts(tx, legs.map(row => row.cashAccountId!));
    if (await tx.financialTransaction.count({ where: { reversalOfId: { in: legs.map(row => row.id) } } })) throw Error("Операция уже исправлена. Обновите страницу.");
    let result = "";
    for (const [index, leg] of legs.entries()) {
      const row = await reverse(tx, actor, leg, { sourceType: legs.length === 2 ? "CASH_TRANSFER_REVERSAL" : "CASH_CORRECTION", sourceId, idempotencyKey: input.idempotencyKey + (index ? ":pair" : ""), reason: input.reason });
      result ||= row.id;
    }
    return result;
  });
}
export async function saveExpenseCategory(actor: Actor, raw: unknown) {
  const input = z.object({ id: uuid.optional(), version: z.number().int().positive().optional(), name: z.string().trim().min(1).max(80), isActive: z.boolean() }).parse(raw);
  return db.$transaction(async tx => {
    await access(tx, actor, "CASH_CATEGORY_MANAGE");
    const old = input.id ? await tx.expenseCategory.findFirst({ where: { id: input.id, organizationId: actor.organizationId } }) : null;
    if (input.id && (!old || old.version !== input.version)) throw Error("Категория уже изменена или недоступна. Обновите страницу.");
    const row = old ? await tx.expenseCategory.update({ where: { id: old.id, version: input.version }, data: { name: input.name, isActive: input.isActive, version: { increment: 1 } } }) : await tx.expenseCategory.create({ data: { organizationId: actor.organizationId, name: input.name, isActive: input.isActive } });
    await appendAuditLog(tx, { organizationId: actor.organizationId, actorUserId: actor.userId, actorMembershipId: actor.membershipId, action: "CASH_EXPENSE_CATEGORY_CHANGED", entityType: "ExpenseCategory", entityId: row.id, metadata: { previousName: old?.name ?? null, name: row.name, previousEffect: old ? old.isActive ? "ALLOW" : "DENY" : null, effect: row.isActive ? "ALLOW" : "DENY", version: row.version } });
    return row.id;
  });
}
export async function cashAccountsView(actor: Actor & { defaultBranchId?: string | null }, input: { branchId?: string; accountId?: string; page?: string }) {
  if (input.branchId) uuid.parse(input.branchId); if (input.accountId) uuid.parse(input.accountId);
  return db.$transaction(async tx => {
    const scope = await access(tx, actor, undefined, input.branchId);
    const branches = await tx.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", id: scope.where.branchId }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } });
    const branch = branches.find(row => row.id === (input.branchId || actor.defaultBranchId)) ?? branches[0]; if (!branch) throw Error("Нет доступного активного филиала.");
    const accounts = await tx.cashAccount.findMany({ where: { organizationId: actor.organizationId, branchId: { in: branches.map(row => row.id) } }, include: { branch: { select: { name: true } }, transactions: { where: { kind: "CASH_OPENING", reversal: null }, select: { id: true, amountMinor: true, occurredAt: true }, take: 1 } }, orderBy: [{ branchId: "asc" }, { kind: "asc" }] });
    const selectedAccounts = accounts.filter(row => row.branchId === branch.id);
    if (input.accountId && !selectedAccounts.some(row => row.id === input.accountId)) throw Error("Касса недоступна в выбранном филиале.");
    const totals = await tx.financialTransaction.groupBy({ by: ["cashAccountId"], where: { organizationId: actor.organizationId, cashAccountId: { in: selectedAccounts.map(row => row.id) } }, _sum: { accountEffectMinor: true } });
    const permittedKinds: FinancialTransaction["kind"][] = [...nativeKinds, ...(permits(scope.member, "PAYMENT_VIEW") ? ["PAYMENT_RECEIVED", "CUSTOMER_REFUND"] as const : []), ...(permits(scope.member, "DEPOSIT_VIEW") ? ["DEPOSIT_RECEIVED", "DEPOSIT_REFUNDED"] as const : []), ...(permits(scope.member, "PAYROLL_VIEW") ? ["PAYROLL_PAYOUT"] as const : [])];
    const page = /^\d{1,5}$/.test(input.page ?? "") ? Math.max(1, Number(input.page)) : 1;
    const rows = await tx.financialTransaction.findMany({ where: { organizationId: actor.organizationId, branchId: branch.id, cashAccountId: input.accountId || { in: selectedAccounts.map(row => row.id) }, OR: [{ kind: { in: permittedKinds } }, { kind: "REVERSAL", reversalOf: { kind: { in: permittedKinds } } }] }, select: { id: true, kind: true, amountMinor: true, accountEffectMinor: true, cashAccountId: true, expenseCategoryName: true, occurredAt: true, reason: true, sourceId: true, sourceType: true, actorUser: { select: { displayName: true } }, reversal: { select: { id: true } }, reversalOf: { select: { kind: true } }, order: permits(scope.member, "ORDER_VIEW") ? { select: { id: true, orderNumber: true } } : false, employee: { select: { user: { select: { displayName: true } } } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 51 });
    const unassigned = await tx.financialTransaction.count({ where: { organizationId: actor.organizationId, branchId: branch.id, cashAccountId: null, OR: [{ cashEffectMinor: { not: 0 } }, { payrollPaidMinor: { not: 0 } }] } });
    const categories = await tx.expenseCategory.findMany({ where: { organizationId: actor.organizationId, ...(permits(scope.member, "CASH_CATEGORY_MANAGE") ? {} : { isActive: true }) }, orderBy: { name: "asc" } });
    return { branches, branch, accounts, selectedAccounts: selectedAccounts.map(row => ({ ...row, balance: totals.find(total => total.cashAccountId === row.id)?._sum.accountEffectMinor ?? BigInt(0), opening: row.transactions[0] ?? null })), categories, rows: rows.slice(0, 50).map(row => ({ ...row, employee: permits(scope.member, "PAYROLL_VIEW") ? row.employee : null })), more: rows.length > 50, page, unassigned,
      canOpen: permits(scope.member, "CASH_ACCOUNT_MANAGE"), canExpense: permits(scope.member, "CASH_EXPENSE_CREATE"), canTransfer: permits(scope.member, "CASH_TRANSFER_CREATE"), canCorrect: permits(scope.member, "CASH_CORRECT"), canCategory: permits(scope.member, "CASH_CATEGORY_MANAGE") };
  });
}
