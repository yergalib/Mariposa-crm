import "server-only";

import type { AuthContext } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { addLocalDays, localParts, parseDateKey, zonedDateTimeToUtc, type LocalDate } from "@/lib/calendar/timezone";
import { getProductEconomicsSummariesWithClient } from "@/lib/catalog/economics";
import { defaultHasPermission, type PermissionKey } from "@/lib/permissions/registry";
import { evaluateReturnSettlement } from "@/lib/finance/order-settlement";
import type { TenantContext } from "@/lib/tenant/context";

const ZERO = BigInt(0);
const TERMINAL = ["CANCELLED", "NO_SHOW", "EXPIRED"] as const;
export type DashboardPeriodPreset = "TODAY" | "SEVEN_DAYS" | "THIS_MONTH" | "LAST_MONTH" | "CUSTOM";
export type DashboardInput = { preset?: DashboardPeriodPreset; start?: string; end?: string; branchId?: string; now?: Date };
export type DashboardMoney = { currency: string; amountMinor: string };
export type DashboardWarningCode = "CROSS_CONTEXT_REVERSAL" | "FINANCE_CONTEXT_MISMATCH" | "NEGATIVE_DEPOSIT" | "FUTURE_FINANCIAL_TRANSACTION" | "RETURN_DATE_MISMATCH" | "MAINTENANCE_CONTEXT_MISSING" | "PHYSICAL_PROVENANCE_MISMATCH";
type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;

function localDate(date: Date, timeZone: string): LocalDate { const x = localParts(date, timeZone); return { year: x.year, month: x.month, day: x.day }; }
function startOfMonth(value: LocalDate): LocalDate { return { year: value.year, month: value.month, day: 1 }; }
function nextMonth(value: LocalDate): LocalDate { return value.month === 12 ? { year: value.year + 1, month: 1, day: 1 } : { year: value.year, month: value.month + 1, day: 1 }; }
function previousMonth(value: LocalDate): LocalDate { return value.month === 1 ? { year: value.year - 1, month: 12, day: 1 } : { year: value.year, month: value.month - 1, day: 1 }; }
function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function timeOfDay(date: Date, timeZone: string) { const x = localParts(date, timeZone); return { hour: x.hour, minute: x.minute, second: x.second }; }
function localCutoff(date: LocalDate, time: ReturnType<typeof timeOfDay>, timeZone: string) { return zonedDateTimeToUtc(date, timeZone, time.hour, time.minute, time.second); }
function localDayCount(start: LocalDate, endExclusive: LocalDate) { let n = 0; for (let x = start; `${x.year}-${x.month}-${x.day}` !== `${endExclusive.year}-${endExclusive.month}-${endExclusive.day}`; x = addLocalDays(x, 1)) n++; return n; }

export function dashboardPeriod(input: DashboardInput, timeZone: string, now: Date) {
  const today = localDate(now, timeZone), preset = input.preset ?? "TODAY", cutoff = timeOfDay(now, timeZone);
  let start = today, endExclusive = addLocalDays(today, 1), rangeEnd = now, comparisonStart: LocalDate, comparisonEnd: Date, comparable = true;
  if (preset === "SEVEN_DAYS") start = addLocalDays(today, -6);
  else if (preset === "THIS_MONTH") start = startOfMonth(today);
  else if (preset === "LAST_MONTH") { start = previousMonth(today); endExclusive = startOfMonth(today); rangeEnd = zonedDateTimeToUtc(endExclusive, timeZone); }
  else if (preset === "CUSTOM") {
    const parsedStart = parseDateKey(input.start), parsedEnd = parseDateKey(input.end);
    if (!parsedStart || !parsedEnd || `${input.start}` > `${input.end}`) throw new Error("Некорректный период Dashboard.");
    start = parsedStart; endExclusive = addLocalDays(parsedEnd, 1); rangeEnd = zonedDateTimeToUtc(endExclusive, timeZone);
  }
  const rangeStart = zonedDateTimeToUtc(start, timeZone);
  if (preset === "TODAY") { comparisonStart = addLocalDays(today, -1); comparisonEnd = localCutoff(comparisonStart, cutoff, timeZone); }
  else if (preset === "SEVEN_DAYS") { comparisonStart = addLocalDays(start, -7); comparisonEnd = localCutoff(addLocalDays(comparisonStart, 6), cutoff, timeZone); }
  else if (preset === "THIS_MONTH") {
    comparisonStart = previousMonth(today); const available = daysInMonth(comparisonStart.year, comparisonStart.month), day = Math.min(today.day, available);
    comparable = today.day <= available; comparisonEnd = comparable ? localCutoff({ year: comparisonStart.year, month: comparisonStart.month, day }, cutoff, timeZone) : rangeStart;
  } else if (preset === "LAST_MONTH") {
    comparisonStart = previousMonth(start); comparisonEnd = rangeStart;
  } else {
    const days = localDayCount(start, endExclusive); comparisonStart = addLocalDays(start, -days); comparisonEnd = rangeStart;
  }
  return { preset, start, endExclusive, rangeStart, rangeEnd, comparisonStart: zonedDateTimeToUtc(comparisonStart, timeZone), comparisonEnd, comparisonCoverageComparable: comparable };
}

function add(map: Map<string, bigint>, currency: string, value: bigint) { map.set(currency, (map.get(currency) ?? ZERO) + value); }
function dto(map: Map<string, bigint>): DashboardMoney[] { return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => ({ currency, amountMinor: amount.toString() })); }
function delta(current: Map<string, bigint>, previous: Map<string, bigint>, comparable: boolean) { return [...new Set([...current.keys(), ...previous.keys()])].sort().map((currency) => { const a = current.get(currency) ?? ZERO, b = previous.get(currency) ?? ZERO; return { currency, currentMinor: a.toString(), previousMinor: b.toString(), absoluteDeltaMinor: (a - b).toString(), percentBasisPoints: comparable && b > ZERO ? ((a - b) * BigInt(10_000) / b).toString() : null, state: b <= ZERO ? (a === b ? "UNCHANGED" : "NO_POSITIVE_BASE") : a > b ? "UP" : a < b ? "DOWN" : "UNCHANGED" }; }); }

async function accessSnapshot(tx: Prisma.TransactionClient, tenant: TenantContext, actor: Actor, requestedBranchId?: string) {
  const membership = await tx.organizationMembership.findFirst({ where: { id: actor.membershipId, userId: actor.userId, organizationId: tenant.organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } }, select: { role: true, organization: { select: { timezone: true } }, permissionOverrides: { select: { permissionKey: true, effect: true } }, branchAccess: { select: { branchId: true } } } });
  if (!membership) return null;
  const has = (key: PermissionKey) => { if (membership.role === "OWNER") return true; const override = membership.permissionOverrides.find((x) => x.permissionKey === key); return override ? override.effect === "ALLOW" : defaultHasPermission(membership.role, key); };
  const branches = await tx.branch.findMany({ where: { organizationId: tenant.organizationId }, select: { id: true, name: true, status: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const granted = new Set(membership.branchAccess.map((x) => x.branchId));
  const accessible = membership.role === "OWNER" ? branches : branches.filter((x) => granted.has(x.id));
  if (requestedBranchId && !accessible.some((x) => x.id === requestedBranchId)) return null;
  const scoped = requestedBranchId ? accessible.filter((x) => x.id === requestedBranchId) : accessible;
  const active = branches.filter((x) => x.status === "ACTIVE"), allActiveBranchesCovered = active.length > 0 && active.every((x) => membership.role === "OWNER" || granted.has(x.id));
  const historicalScopeComplete = membership.role === "OWNER" || branches.every((x) => granted.has(x.id));
  return { role: membership.role, timeZone: membership.organization.timezone, has, branches: accessible, scopedIds: scoped.map((x) => x.id), allActiveBranchesCovered, historicalScopeComplete, owner: membership.role === "OWNER" };
}

function revenueFamily(row: { kind: string; sourceType: string; sourceId: string | null; orderId: string | null; reversalOf: null | { kind: string; sourceType: string; sourceId: string | null; orderId: string | null } }) {
  const root = row.kind === "REVERSAL" ? row.reversalOf : row;
  if (!root) return "AMBIGUOUS" as const;
  if ((root.kind === "RENTAL_CHARGE" || root.kind === "DISCOUNT") && root.sourceType === "ORDER_CHARGE" && root.sourceId === root.orderId) return "RENTAL" as const;
  if (root.kind === "DAMAGE_CHARGE" && root.sourceType === "RETURN_DAMAGE_ASSESSMENT") return "DAMAGE" as const;
  if (root.kind === "SALE_CHARGE") return "OTHER" as const;
  return row.kind === "REVERSAL" || root.kind === "DISCOUNT" || root.kind.endsWith("CHARGE") ? "AMBIGUOUS" as const : "OTHER" as const;
}

export async function getDashboard(tenant: TenantContext, input: DashboardInput, actor: Actor) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const access = await accessSnapshot(tx, tenant, actor, input.branchId);
    if (!access) return null;
    const period = dashboardPeriod(input, access.timeZone, now), branchIds = access.scopedIds;
    const financeDashboard = access.has("FINANCE_DASHBOARD_VIEW"), margin = financeDashboard && access.has("FINANCE_MARGIN_VIEW"), payments = financeDashboard && access.has("PAYMENT_VIEW"), balancesVisible = financeDashboard && access.has("CUSTOMER_BALANCE_VIEW"), depositsVisible = financeDashboard && access.has("DEPOSIT_VIEW"), acquisitionVisible = financeDashboard && access.has("FINANCE_PURCHASE_COST_VIEW");
    const orderView = access.has("ORDER_VIEW"), inventoryView = access.has("INVENTORY_VIEW"), catalogView = access.has("CATALOG_VIEW");
    const financialRows = financeDashboard && branchIds.length ? await tx.financialTransaction.findMany({ where: { organizationId: tenant.organizationId, branchId: { in: branchIds }, OR: [{ occurredAt: { gte: period.comparisonStart, lt: period.comparisonEnd } }, { occurredAt: { gte: period.rangeStart, lt: period.rangeEnd } }, { occurredAt: { gt: now } }] }, select: { id: true, kind: true, orderId: true, customerId: true, branchId: true, currency: true, sourceType: true, sourceId: true, occurredAt: true, revenueEffectMinor: true, cashEffectMinor: true, obligationEffectMinor: true, depositEffectMinor: true, reversalOf: { select: { id: true, kind: true, orderId: true, customerId: true, branchId: true, currency: true, sourceType: true, sourceId: true } } }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }) : [];
    const historicalReversals = financeDashboard && branchIds.length ? await tx.financialTransaction.findMany({ where: { organizationId: tenant.organizationId, branchId: { in: branchIds }, kind: "REVERSAL" }, select: { orderId: true, customerId: true, branchId: true, currency: true, reversalOf: { select: { orderId: true, customerId: true, branchId: true, currency: true } } } }) : [];
    const financialWarnings = new Set<DashboardWarningCode>();
    if (financialRows.some((x) => x.occurredAt > now)) financialWarnings.add("FUTURE_FINANCIAL_TRANSACTION");
    for (const row of financialRows) if (row.kind === "REVERSAL" && row.reversalOf && (row.orderId !== row.reversalOf.orderId || row.customerId !== row.reversalOf.customerId || row.branchId !== row.reversalOf.branchId || row.currency !== row.reversalOf.currency)) financialWarnings.add("CROSS_CONTEXT_REVERSAL");
    for (const row of historicalReversals) if (row.reversalOf && (row.orderId !== row.reversalOf.orderId || row.customerId !== row.reversalOf.customerId || row.branchId !== row.reversalOf.branchId || row.currency !== row.reversalOf.currency)) financialWarnings.add("CROSS_CONTEXT_REVERSAL");
    const currentRevenue = new Map<string, bigint>(), previousRevenue = new Map<string, bigint>(), rentalRevenue = new Map<string, bigint>(), damageRevenue = new Map<string, bigint>(), otherRevenue = new Map<string, bigint>(), ambiguousRevenue = new Map<string, bigint>(), paymentCash = new Map<string, bigint>(), refundCash = new Map<string, bigint>();
    const daily = new Map<string, { revenue: Map<string, bigint>; payments: Map<string, bigint>; refunds: Map<string, bigint> }>();
    for (const row of financialRows) {
      const current = row.occurredAt >= period.rangeStart && row.occurredAt < period.rangeEnd, previous = row.occurredAt >= period.comparisonStart && row.occurredAt < period.comparisonEnd;
      if (!current && !previous) continue;
      const target = current ? currentRevenue : previousRevenue; add(target, row.currency, row.revenueEffectMinor);
      const family = revenueFamily(row);
      if (current && margin) add(family === "RENTAL" ? rentalRevenue : family === "DAMAGE" ? damageRevenue : family === "AMBIGUOUS" ? ambiguousRevenue : otherRevenue, row.currency, row.revenueEffectMinor);
      const rootKind = row.kind === "REVERSAL" ? row.reversalOf?.kind : row.kind;
      if (current && payments && rootKind === "PAYMENT_RECEIVED") add(paymentCash, row.currency, row.cashEffectMinor);
      if (current && payments && rootKind === "CUSTOMER_REFUND") add(refundCash, row.currency, row.cashEffectMinor);
      if (current) { const key = new Intl.DateTimeFormat("en-CA", { timeZone: access.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(row.occurredAt), day = daily.get(key) ?? { revenue: new Map(), payments: new Map(), refunds: new Map() }; if (margin) add(day.revenue, row.currency, row.revenueEffectMinor); if (payments && rootKind === "PAYMENT_RECEIVED") add(day.payments, row.currency, row.cashEffectMinor); if (payments && rootKind === "CUSTOMER_REFUND") add(day.refunds, row.currency, -row.cashEffectMinor); daily.set(key, day); }
    }
    const balanceRows = (balancesVisible || depositsVisible) && branchIds.length ? await tx.financialTransaction.groupBy({ by: ["orderId", "customerId", "branchId", "currency"], where: { organizationId: tenant.organizationId, branchId: { in: branchIds } }, _sum: { obligationEffectMinor: true, depositEffectMinor: true } }) : [];
    const debt = new Map<string, bigint>(), credits = new Map<string, bigint>(), held = new Map<string, bigint>();
    for (const row of balanceRows) { const obligation = row._sum.obligationEffectMinor ?? ZERO, deposit = row._sum.depositEffectMinor ?? ZERO; if (balancesVisible) add(obligation > ZERO ? debt : credits, row.currency, obligation > ZERO ? obligation : -obligation); if (depositsVisible) { if (deposit > ZERO) add(held, row.currency, deposit); else if (deposit < ZERO) financialWarnings.add("NEGATIVE_DEPOSIT"); } }
    const acquisition = new Map<string, bigint>();
    if (acquisitionVisible && branchIds.length) { const rows = await tx.purchaseReceiptLine.groupBy({ by: ["currency"], where: { organizationId: tenant.organizationId, purchaseReceipt: { branchId: { in: branchIds }, receivedAt: { gte: period.rangeStart, lt: period.rangeEnd } } }, _sum: { totalAcquisitionCostMinor: true } }); rows.forEach((x) => add(acquisition, x.currency, x._sum.totalAcquisitionCostMinor ?? ZERO)); }
    const orders = orderView && branchIds.length ? await tx.order.findMany({ where: { organizationId: tenant.organizationId, branchId: { in: branchIds }, type: "RENTAL", OR: [{ rentalStartAt: { gte: period.rangeStart, lt: period.rangeEnd } }, { expectedReturnAt: { gte: period.rangeStart, lt: period.rangeEnd } }, { capacityAllocations: { some: { issuedQuantity: { gt: 0 } } } }] }, select: { id: true, orderNumber: true, branchId: true, customerId: true, currency: true, status: true, rentalStartAt: true, rentalEndAt: true, expectedReturnAt: true, readyAt: true, customer: { select: { firstName: true, lastName: true } }, branch: { select: { name: true } }, items: { where: { removedAt: null }, select: { quantity: true, productNameSnapshot: true, variantNameSnapshot: true } }, capacityAllocations: { where: { sourceType: "ORDER" }, select: { id: true, orderItemId: true, branchId: true, issuedQuantity: true, returnedQuantity: true, issuedAt: true, returnedAt: true, returnInspectionResult: true, productInstanceId: true } } }, orderBy: [{ rentalStartAt: "asc" }, { id: "asc" }] }) : [];
    const allocationIds = orders.flatMap((x) => x.capacityAllocations.map((a) => a.id));
    const movements = orderView && allocationIds.length ? await tx.inventoryMovement.findMany({ where: { organizationId: tenant.organizationId, sourceType: "CAPACITY_ALLOCATION", sourceId: { in: allocationIds }, type: { in: ["RENTAL_ISSUE", "RENTAL_RETURN"] }, OR: [{ occurredAt: { gte: period.comparisonStart, lt: period.comparisonEnd } }, { occurredAt: { gte: period.rangeStart, lt: period.rangeEnd } }] }, select: { id: true, sourceId: true, type: true, quantity: true, fromBranchId: true, toBranchId: true, occurredAt: true }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }) : [];
    const orderByAllocation = new Map(orders.flatMap((o) => o.capacityAllocations.map((a) => [a.id, o] as const))), issuedOrders = new Set<string>(), returnedOrders = new Set<string>(); let issuedQuantity = 0, returnedQuantity = 0;
    const physicalDaily = new Map<string, { issued: number; returned: number }>();
    for (const movement of movements) { const order = movement.sourceId ? orderByAllocation.get(movement.sourceId) : undefined; if (!order) { financialWarnings.add("PHYSICAL_PROVENANCE_MISMATCH"); continue; } const scopedBranch = movement.type === "RENTAL_ISSUE" ? movement.fromBranchId : movement.toBranchId; if (!scopedBranch || !branchIds.includes(scopedBranch)) continue; const quantity = Math.abs(movement.quantity); if (movement.occurredAt >= period.rangeStart && movement.occurredAt < period.rangeEnd) { if (movement.type === "RENTAL_ISSUE") { issuedQuantity += quantity; issuedOrders.add(order.id); } else { returnedQuantity += quantity; returnedOrders.add(order.id); } const key = new Intl.DateTimeFormat("en-CA", { timeZone: access.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(movement.occurredAt), day = physicalDaily.get(key) ?? { issued: 0, returned: 0 }; if (movement.type === "RENTAL_ISSUE") day.issued += quantity; else day.returned += quantity; physicalDaily.set(key, day); } }
    const alerts: Array<{ type: string; orderId?: string; productInstanceId?: string; label: string; actionAllowed: boolean }> = [], upcoming: Array<{ type: "ISSUE" | "RETURN"; at: Date; orderId: string; orderNumber: string; customer: string; branch: string; items: string; status: string }> = [];
    const settlementOrderIds = orders.filter((x) => x.capacityAllocations.some((a) => a.issuedQuantity > 0)).map((x) => x.id), damagedAllocationIds = orders.flatMap((x) => x.capacityAllocations.filter((a) => a.returnedAt && a.returnInspectionResult === "DAMAGED" && a.productInstanceId).map((a) => a.id));
    const settlementFinance = settlementOrderIds.length ? await tx.financialTransaction.findMany({ where: { organizationId: tenant.organizationId, orderId: { in: settlementOrderIds } }, select: { orderId: true, kind: true, sourceType: true, sourceId: true, obligationEffectMinor: true, revenueEffectMinor: true, depositEffectMinor: true, reversalOf: { select: { kind: true, sourceType: true, sourceId: true } }, reversal: { select: { id: true } } } }) : [];
    const damageWaivers = settlementOrderIds.length && damagedAllocationIds.length ? await tx.auditLog.findMany({ where: { organizationId: tenant.organizationId, action: "ORDER_DAMAGE_WAIVED", entityType: "CapacityAllocation", entityId: { in: damagedAllocationIds } }, select: { entityId: true } }) : [];
    const waived = new Set(damageWaivers.map((x) => x.entityId));
    let activeRentalQuantity = 0, overdueQuantity = 0, partialReturnCount = 0;
    for (const order of orders) {
      if (order.expectedReturnAt && order.rentalEndAt && order.expectedReturnAt.getTime() !== order.rentalEndAt.getTime()) financialWarnings.add("RETURN_DATE_MISMATCH");
      const issued = order.capacityAllocations.reduce((s, a) => s + a.issuedQuantity, 0), returned = order.capacityAllocations.reduce((s, a) => s + a.returnedQuantity, 0), outstanding = Math.max(issued - returned, 0), commercial = order.items.reduce((s, x) => s + x.quantity, 0), remaining = Math.max(commercial - issued, 0), terminal = TERMINAL.includes(order.status as never);
      activeRentalQuantity += outstanding; if (returned > 0 && outstanding > 0) partialReturnCount++;
      const deadline = order.expectedReturnAt ?? order.rentalEndAt;
      if (outstanding > 0 && deadline && deadline < now) { overdueQuantity += outstanding; alerts.push({ type: "OVERDUE_RETURN", orderId: order.id, label: `${order.orderNumber}: просрочено ${outstanding}`, actionAllowed: access.has("RETURN_PROCESS") }); }
      if (!terminal && remaining > 0 && order.rentalStartAt && order.rentalStartAt <= now) alerts.push({ type: order.readyAt ? "READY_NOT_ISSUED" : "ISSUE_NOT_READY", orderId: order.id, label: order.readyAt ? `${order.orderNumber}: готово, но не выдано` : `${order.orderNumber}: выдача не готова`, actionAllowed: order.readyAt ? access.has("RENTAL_ISSUE") : access.has("RENTAL_PREPARE") });
      if (returned > 0 && outstanding > 0) alerts.push({ type: "INCOMPLETE_RETURN", orderId: order.id, label: `${order.orderNumber}: возврат не завершён`, actionAllowed: access.has("RETURN_PROCESS") });
      if (issued > 0) {
        const rows = settlementFinance.filter((x) => x.orderId === order.id), damaged = order.capacityAllocations.filter((a) => a.returnedAt && a.returnInspectionResult === "DAMAGED" && a.productInstanceId);
        const unresolved = damaged.filter((allocation) => !waived.has(allocation.id) && !rows.some((x) => x.kind === "DAMAGE_CHARGE" && x.sourceType === "RETURN_DAMAGE_ASSESSMENT" && x.sourceId === allocation.id && !x.reversal)).length;
        const obligation = rows.reduce((s, x) => s + x.obligationEffectMinor, ZERO), deposit = rows.reduce((s, x) => s + x.depositEffectMinor, ZERO);
        const damage = rows.filter((x) => { const root = x.kind === "REVERSAL" ? x.reversalOf : x; return root?.kind === "DAMAGE_CHARGE" && root.sourceType === "RETURN_DAMAGE_ASSESSMENT"; }).reduce((s, x) => s + x.revenueEffectMinor, ZERO);
        const withheld = -rows.filter((x) => { const root = x.kind === "REVERSAL" ? x.reversalOf : x; return root?.kind === "DEPOSIT_WITHHELD"; }).reduce((s, x) => s + x.obligationEffectMinor, ZERO);
        const activeDamageChargeCount = rows.filter((x) => x.kind === "DAMAGE_CHARGE" && !x.reversal).length;
        const settlement = evaluateReturnSettlement({ orderStatus: order.status, issuedQuantity: issued, returnedQuantity: returned, unresolvedDamageCount: unresolved, outstandingMinor: obligation, heldDepositMinor: deposit, damageChargeMinor: damage, damageWithheldMinor: withheld, activeDamageChargeCount });
        if (unresolved && (access.has("DAMAGE_ASSESS") || access.has("DEPOSIT_WITHHOLD"))) alerts.push({ type: "DAMAGE_DECISION_REQUIRED", orderId: order.id, label: `${order.orderNumber}: требуется решение по ущербу`, actionAllowed: access.has("DAMAGE_ASSESS") });
        if (settlement.physicalComplete && obligation > ZERO && balancesVisible) alerts.push({ type: "DEBT_AFTER_RETURN", orderId: order.id, label: `${order.orderNumber}: долг после возврата`, actionAllowed: access.has("PAYMENT_CREATE") });
        if (settlement.physicalComplete && deposit > ZERO && depositsVisible) alerts.push({ type: "DEPOSIT_REVIEW_REQUIRED", orderId: order.id, label: settlement.canRefundDeposit ? `${order.orderNumber}: залог можно вернуть` : `${order.orderNumber}: залог требует проверки`, actionAllowed: settlement.canRefundDeposit && access.has("DEPOSIT_REFUND") });
      }
      const itemLabel = order.items.slice(0, 2).map((x) => `${x.productNameSnapshot} · ${x.variantNameSnapshot}`).join(", ");
      if (!terminal && remaining > 0 && order.rentalStartAt && order.rentalStartAt >= now) upcoming.push({ type: "ISSUE", at: order.rentalStartAt, orderId: order.id, orderNumber: order.orderNumber, customer: [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" "), branch: order.branch.name, items: itemLabel, status: order.readyAt ? "Готово" : "К подготовке" });
      if (outstanding > 0 && deadline && deadline >= now) upcoming.push({ type: "RETURN", at: deadline, orderId: order.id, orderNumber: order.orderNumber, customer: [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" "), branch: order.branch.name, items: itemLabel, status: "В аренде" });
    }
    let cleaning = 0, repair = 0, lost = 0;
    if (inventoryView && branchIds.length) { const instances = await tx.productInstance.findMany({ where: { organizationId: tenant.organizationId, currentBranchId: { in: branchIds }, operationalStatus: { in: ["CLEANING", "REPAIR", "LOST"] } }, select: { id: true, inventoryNumber: true, operationalStatus: true, capacityAllocations: { where: { sourceType: "MAINTENANCE", status: "ACTIVE" }, select: { id: true } } } }); for (const instance of instances) { if (instance.operationalStatus === "CLEANING") cleaning++; else if (instance.operationalStatus === "REPAIR") repair++; else lost++; if ((instance.operationalStatus === "CLEANING" || instance.operationalStatus === "REPAIR") && !instance.capacityAllocations.length) financialWarnings.add("MAINTENANCE_CONTEXT_MISSING"); if (instance.operationalStatus !== "LOST") alerts.push({ type: instance.operationalStatus, productInstanceId: instance.id, label: `${instance.inventoryNumber}: ${instance.operationalStatus === "CLEANING" ? "чистка" : "ремонт"}`, actionAllowed: access.has("MAINTENANCE_COMPLETE") }); } }
    const productSummaries = catalogView && margin ? await getProductEconomicsSummariesWithClient(tx, tenant, { membershipId: actor.membershipId, role: access.role }) : [];
    const productRanking = productSummaries.flatMap((p) => p.economicsByCurrency.map((c) => ({ productId: p.productId, name: p.name, currency: c.currency, rentalRevenueMinor: c.rentalEarnedRevenue.amountMinor, issuedQuantity: p.issuedRentalQuantity, rentalPaybackBasisPoints: c.rentalPaybackBasisPoints, scopeComplete: p.scopeComplete, costCoverageComplete: p.costCoverageComplete, revenueAttributionComplete: p.revenueAttributionComplete }))).sort((a, b) => a.currency.localeCompare(b.currency) || (BigInt(a.rentalRevenueMinor) === BigInt(b.rentalRevenueMinor) ? a.productId.localeCompare(b.productId) : BigInt(a.rentalRevenueMinor) > BigInt(b.rentalRevenueMinor) ? -1 : 1)).slice(0, 10);
    const quickActions = [{ label: "Новый заказ", href: "/orders/new", visible: access.has("ORDER_CREATE") }, { label: "Найти товар", href: "/products", visible: catalogView }, { label: "Принять возврат", href: "/returns", visible: access.has("RETURN_PROCESS") }, { label: "Операции склада", href: "/warehouse/operations", visible: access.has("INVENTORY_VIEW") }].filter((x) => x.visible).map(({ visible: _, ...x }) => x);
    const financialCodes = new Set<DashboardWarningCode>(["CROSS_CONTEXT_REVERSAL", "FINANCE_CONTEXT_MISMATCH", "NEGATIVE_DEPOSIT", "FUTURE_FINANCIAL_TRANSACTION"]);
    const visibleFinancialWarnings = financeDashboard ? [...financialWarnings].filter((x) => financialCodes.has(x) && (x !== "NEGATIVE_DEPOSIT" || depositsVisible) && (x !== "CROSS_CONTEXT_REVERSAL" || margin || payments || balancesVisible || depositsVisible)) : [];
    const integrityWarnings = [...financialWarnings].filter((x) => visibleFinancialWarnings.includes(x) || x === "RETURN_DATE_MISMATCH" && orderView || x === "PHYSICAL_PROVENANCE_MISMATCH" && orderView || x === "MAINTENANCE_CONTEXT_MISSING" && inventoryView);
    const branchRows = access.branches.filter((b) => branchIds.includes(b.id)).map((branch) => { const revenue = new Map<string, bigint>(), cash = new Map<string, bigint>(); for (const row of financialRows) if (row.branchId === branch.id && row.occurredAt >= period.rangeStart && row.occurredAt < period.rangeEnd) { if (margin) add(revenue, row.currency, row.revenueEffectMinor); const rootKind = row.kind === "REVERSAL" ? row.reversalOf?.kind : row.kind; if (payments && (rootKind === "PAYMENT_RECEIVED" || rootKind === "CUSTOMER_REFUND")) add(cash, row.currency, row.cashEffectMinor); } return { branchId: branch.id, branchName: branch.name, ...(margin ? { netRevenue: dto(revenue) } : {}), ...(payments ? { netCustomerCash: dto(cash) } : {}) }; });
    return { generatedAt: now, timeZone: access.timeZone, period, scope: { selectedBranchId: input.branchId ?? null, branches: access.branches, allActiveBranchesCovered: access.allActiveBranchesCovered, historicalScopeComplete: access.historicalScopeComplete }, permissions: { financeDashboard, margin, payments, balances: balancesVisible, deposits: depositsVisible, acquisition: acquisitionVisible, orderView, inventoryView, catalogView }, financial: financeDashboard ? { ...(margin ? { netAccruedRevenue: dto(currentRevenue), rentalAccruedRevenue: dto(rentalRevenue), damageCompensationAccrued: dto(damageRevenue), otherRevenue: dto(otherRevenue), unattributedRevenue: dto(ambiguousRevenue), revenueComparison: delta(currentRevenue, previousRevenue, period.comparisonCoverageComparable) } : {}), ...(payments ? { paymentsReceived: dto(paymentCash), customerRefunds: dto(new Map([...refundCash].map(([k, v]) => [k, -v]))), netCustomerPaymentCash: dto(new Map([...new Set([...paymentCash.keys(), ...refundCash.keys()])].map((k) => [k, (paymentCash.get(k) ?? ZERO) + (refundCash.get(k) ?? ZERO)]))) } : {}), ...(balancesVisible ? { outstandingDebt: dto(debt), negativeBalances: dto(credits), balanceComplete: !financialWarnings.has("CROSS_CONTEXT_REVERSAL") && !financialWarnings.has("FINANCE_CONTEXT_MISMATCH") } : {}), ...(depositsVisible ? { heldDeposits: dto(held), depositComplete: !financialWarnings.has("NEGATIVE_DEPOSIT") && !financialWarnings.has("CROSS_CONTEXT_REVERSAL") } : {}), ...(acquisitionVisible ? { acquisitionReceived: dto(acquisition) } : {}), daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, x]) => ({ date, ...(margin ? { revenue: dto(x.revenue) } : {}), ...(payments ? { payments: dto(x.payments), refunds: dto(x.refunds) } : {}) })), warnings: visibleFinancialWarnings } : null, operations: orderView || inventoryView ? { activeRentalQuantity, overdueQuantity, partialReturnCount, issuedQuantity, returnedQuantity, issuedOrderCount: issuedOrders.size, returnedOrderCount: returnedOrders.size, cleaning, repair, lost, daily: [...physicalDaily].sort(([a], [b]) => a.localeCompare(b)).map(([date, x]) => ({ date, ...x })) } : null, quickActions, upcoming: orderView ? upcoming.sort((a, b) => a.at.getTime() - b.at.getTime() || a.orderId.localeCompare(b.orderId)).slice(0, 10) : [], alerts: alerts.slice(0, 20), products: productRanking, branches: branchRows, integrityWarnings, productBlockLifetime: true };
  }, { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 60_000 });
}
