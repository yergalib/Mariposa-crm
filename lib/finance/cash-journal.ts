import "server-only";
import type { FinancialTransactionKind, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { workflowScope, permits, type WorkflowActor } from "@/lib/workflow-access";
import { cashAccountReadKinds } from "@/lib/finance/cash-accounts";
import { financePeriod } from "@/lib/finance/filters";
import { addLocalDays, localDateKey, parseDateKey, zonedDateTimeToUtc } from "@/lib/calendar/timezone";

export type CashJournalRaw = Record<string, string | string[] | undefined>;
const KEYS = ["branchId", "accountId", "from", "until", "categoryId", "kind", "direction", "q", "page", "transactionId"] as const;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;
export const JOURNAL_GROUP_LABELS: Record<string, string> = {
  opening: "Задание остатка", payment: "Оплаты и возвраты заказов", deposit: "Залоги", expense: "Расходы кассы",
  transfer: "Внутренние переводы", payroll: "Выплаты сотрудникам", reversal: "Исправления записей", other: "Прочее",
};
function groupFor(kind: FinancialTransactionKind) {
  if (kind === "CASH_OPENING") return "opening";
  if (kind === "PAYMENT_RECEIVED" || kind === "CUSTOMER_REFUND") return "payment";
  if (kind === "DEPOSIT_RECEIVED" || kind === "DEPOSIT_REFUNDED") return "deposit";
  if (kind === "CASH_EXPENSE") return "expense";
  if (kind === "CASH_TRANSFER_IN" || kind === "CASH_TRANSFER_OUT") return "transfer";
  if (kind === "PAYROLL_PAYOUT") return "payroll";
  return kind === "REVERSAL" ? "reversal" : "other";
}
function parse(raw: CashJournalRaw) {
  const values: Partial<Record<typeof KEYS[number], string>> = {};
  for (const key of KEYS) {
    if (Array.isArray(raw[key])) throw Error("Каждый фильтр указывается только один раз.");
    if (typeof raw[key] === "string") values[key] = (raw[key] as string).trim();
  }
  for (const key of ["branchId", "accountId", "categoryId", "transactionId"] as const) if (values[key] && !UUID.test(values[key])) throw Error("Некорректный счёт, категория или операция.");
  if (values.direction && !["in", "out"].includes(values.direction)) throw Error("Некорректное направление движения.");
  if ((values.q?.length ?? 0) > 100) throw Error("Поиск: не более 100 символов.");
  return values;
}
async function flow(tx: Prisma.TransactionClient, where: Prisma.FinancialTransactionWhereInput) {
  const incoming = await tx.financialTransaction.groupBy({ by: ["kind"], where: { AND: [where, { accountEffectMinor: { gt: BigInt(0) } }] }, _sum: { accountEffectMinor: true } });
  const outgoing = await tx.financialTransaction.groupBy({ by: ["kind"], where: { AND: [where, { accountEffectMinor: { lt: BigInt(0) } }] }, _sum: { accountEffectMinor: true } });
  const groups = new Map<string, { key: string; incoming: bigint; outgoing: bigint }>();
  for (const [direction, rows] of [["incoming", incoming], ["outgoing", outgoing]] as const) for (const row of rows) {
    const key = groupFor(row.kind), current = groups.get(key) ?? { key, incoming: BigInt(0), outgoing: BigInt(0) };
    current[direction] += (row._sum.accountEffectMinor ?? BigInt(0)) * (direction === "incoming" ? BigInt(1) : BigInt(-1));
    groups.set(key, current);
  }
  return { incoming: incoming.reduce((sum, row) => sum + (row._sum.accountEffectMinor ?? BigInt(0)), BigInt(0)),
    outgoing: -outgoing.reduce((sum, row) => sum + (row._sum.accountEffectMinor ?? BigInt(0)), BigInt(0)), groups: [...groups.values()] };
}

export async function getCashJournal(actor: WorkflowActor & { defaultBranchId?: string | null }, raw: CashJournalRaw, now = new Date()) {
  const filters = parse(raw);
  return db.$transaction(async tx => {
    const scope = await workflowScope(tx, actor, ["CASH_ACCOUNT_VIEW"], filters.branchId || undefined);
    const branches = await tx.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", id: scope.where.branchId }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } });
    const branch = branches.find(row => row.id === (filters.branchId || actor.defaultBranchId)) ?? branches[0];
    if (!branch) throw Error("Нет доступного активного филиала.");
    const accounts = await tx.cashAccount.findMany({ where: { organizationId: actor.organizationId, branchId: branch.id }, select: { id: true, kind: true, currency: true }, orderBy: { kind: "asc" } });
    const account = filters.accountId ? accounts.find(row => row.id === filters.accountId) : accounts[0];
    if (filters.accountId && !account) throw Error("Касса недоступна в выбранном филиале.");
    const validated = financePeriod(filters, new Date(`${localDateKey(now, branch.timezone)}T00:00:00Z`));
    const period = { ...validated, from: zonedDateTimeToUtc(parseDateKey(validated.fromLabel)!, branch.timezone), endExclusive: zonedDateTimeToUtc(addLocalDays(parseDateKey(validated.untilLabel)!, 1), branch.timezone) };
    const kinds = cashAccountReadKinds(scope.member), canOrder = permits(scope.member, "ORDER_VIEW"), canPayroll = permits(scope.member, "PAYROLL_VIEW");
    const canTotals = permits(scope.member, "PAYMENT_VIEW") && permits(scope.member, "DEPOSIT_VIEW") && canPayroll;
    if (filters.kind && filters.kind !== "REVERSAL" && !kinds.includes(filters.kind as FinancialTransactionKind)) throw Error("Этот вид операции недоступен по вашим правам.");
    const categories = await tx.expenseCategory.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } });
    if (filters.categoryId && !categories.some(row => row.id === filters.categoryId)) throw Error("Категория недоступна.");
    if (!account) return { account: null, branches, branch, accounts, categories, filters, period, kinds, canOrder, canPayroll, canTotals } as const;
    const accountScope = { organizationId: actor.organizationId, branchId: branch.id, cashAccountId: account.id };
    const periodWhere: Prisma.FinancialTransactionWhereInput = { ...accountScope, occurredAt: { gte: period.from, lt: period.endExclusive } };
    const visibility: Prisma.FinancialTransactionWhereInput = { OR: [{ kind: { in: kinds } }, { kind: "REVERSAL", reversalOf: { organizationId: actor.organizationId, kind: { in: kinds } } }] };
    const conditions: Prisma.FinancialTransactionWhereInput[] = [periodWhere, visibility];
    if (filters.kind) conditions.push({ OR: [{ kind: filters.kind as FinancialTransactionKind }, ...(filters.kind !== "REVERSAL" ? [{ kind: "REVERSAL" as const, reversalOf: { kind: filters.kind as FinancialTransactionKind } }] : [])] });
    if (filters.categoryId) conditions.push({ OR: [{ expenseCategoryId: filters.categoryId }, { kind: "REVERSAL", reversalOf: { expenseCategoryId: filters.categoryId } }] });
    if (filters.direction) conditions.push({ accountEffectMinor: filters.direction === "in" ? { gt: BigInt(0) } : { lt: BigInt(0) } });
    if (filters.transactionId) conditions.push({ id: filters.transactionId });
    if (filters.q) conditions.push({ OR: [
      { reason: { contains: filters.q, mode: "insensitive" } }, { expenseCategoryName: { contains: filters.q, mode: "insensitive" } },
      { reversalOf: { expenseCategoryName: { contains: filters.q, mode: "insensitive" } } },
      ...(UUID.test(filters.q) ? [{ id: filters.q }] : []),
      ...(canOrder ? [{ order: { orderNumber: { contains: filters.q, mode: "insensitive" as const } } }] : []),
    ] });
    const where: Prisma.FinancialTransactionWhereInput = { AND: conditions };
    const total = await tx.financialTransaction.count({ where });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(/^\d{1,6}$/.test(filters.page ?? "") ? Math.max(1, Number(filters.page)) : 1, pages);
    const rows = await tx.financialTransaction.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, kind: true, occurredAt: true, accountEffectMinor: true, currency: true, reason: true, expenseCategoryName: true,
        actorUser: { select: { displayName: true } }, paymentMethod: { select: { displayName: true } },
        reversalOf: { select: { id: true, kind: true, occurredAt: true, cashAccountId: true, expenseCategoryName: true } },
        reversal: { select: { id: true, occurredAt: true, cashAccountId: true } },
        order: canOrder ? { select: { id: true, orderNumber: true } } : false,
        ...(canPayroll ? { employee: { select: { user: { select: { displayName: true } } } } } as const : {}),
      } });
    const filteredFlow = await flow(tx, where);
    // Full balances are not inferred from a permission-filtered journal. Read
    // accountEffectMinor exactly as the existing cash account service does.
    let summary = null;
    if (canTotals) {
      const opening = await tx.financialTransaction.findFirst({ where: { ...accountScope, kind: "CASH_OPENING" }, select: { occurredAt: true }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
      const before = await tx.financialTransaction.aggregate({ where: { ...accountScope, occurredAt: { lt: period.from } }, _sum: { accountEffectMinor: true } });
      const after = await tx.financialTransaction.aggregate({ where: { ...accountScope, occurredAt: { lt: period.endExclusive } }, _sum: { accountEffectMinor: true } });
      summary = { openingAt: opening?.occurredAt ?? null,
        begin: opening && opening.occurredAt < period.from ? before._sum.accountEffectMinor ?? BigInt(0) : null,
        end: opening && opening.occurredAt < period.endExclusive ? after._sum.accountEffectMinor ?? BigInt(0) : null,
        ...await flow(tx, periodWhere) };
    }
    const unassigned = await tx.financialTransaction.count({ where: { AND: [visibility, { organizationId: actor.organizationId, branchId: branch.id, cashAccountId: null, occurredAt: { gte: period.from, lt: period.endExclusive }, OR: [{ cashEffectMinor: { not: BigInt(0) } }, { payrollPaidMinor: { not: BigInt(0) } }] }] } });
    return { account, branches, branch, accounts, categories, filters, period, kinds, canOrder, canPayroll, canTotals, summary, filteredFlow, unassigned,
      rows: rows.map(row => ({ ...row, order: canOrder ? row.order : null, employee: canPayroll && row.employee && "user" in row.employee && row.employee.user && typeof row.employee.user === "object" && "displayName" in row.employee.user && typeof row.employee.user.displayName === "string" ? { user: { displayName: row.employee.user.displayName } } : null })),
      total, page, pages, first: total ? (page - 1) * PAGE_SIZE + 1 : 0, last: Math.min(page * PAGE_SIZE, total) };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}
