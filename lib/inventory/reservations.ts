import "server-only";
import { createTenantContext } from "@/lib/tenant/context";
import { db } from "@/lib/db";
import { workflowScope, type WorkflowActor } from "@/lib/workflow-access";
import { buildCapacitySegments, calculatePeakBlockedCapacity, getVariantAvailabilityWithClient } from "@/lib/availability/capacity";
import { addLocalDays, formatBusinessLocalDateTimeInput, localParts, parseBusinessLocalDateTime, zonedDateTimeToUtc } from "@/lib/calendar/timezone";
import { warehouseStates } from "@/lib/inventory/warehouse-states";

export type ReservationParams = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;
const orderSelect = { id: true, organizationId: true, branchId: true, orderNumber: true, status: true, rentalStartAt: true, rentalEndAt: true } as const;

export function reservationParams(raw: ReservationParams) {
  for (const key of ["variantId", "branch", "mode", "from", "until", "page"]) {
    if (Array.isArray(raw[key])) throw new Error("Каждый фильтр указывается только один раз.");
  }
  const value = (key: string) => typeof raw[key] === "string" ? raw[key] as string : "";
  const variantId = value("variantId"), branchId = value("branch"), mode = value("mode") || "now";
  if (!UUID.test(variantId) || !UUID.test(branchId)) throw new Error("Выберите вариант и филиал из склада.");
  if (mode !== "now" && mode !== "dates") throw new Error("Некорректный режим просмотра.");
  const page = /^\d{1,6}$/.test(value("page")) ? Math.max(1, Number(value("page"))) : 1;
  return { variantId, branchId, mode, from: value("from"), until: value("until"), page };
}

export async function getReservationDetails(actor: WorkflowActor, raw: ReservationParams, now = new Date()) {
  const input = reservationParams(raw);
  return db.$transaction(async tx => {
    await workflowScope(tx, actor, ["INVENTORY_VIEW", "ORDER_VIEW"], input.branchId);
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true, name: true, timezone: true } });
    const variant = await tx.productVariant.findFirst({
      where: { id: input.variantId, organizationId: actor.organizationId },
      select: { id: true, sku: true, isActive: true, size: { select: { code: true } }, product: { select: { id: true, name: true, trackingMode: true, archivedAt: true } } },
    });
    if (!branch || !variant) throw new Error("Товар или филиал недоступен.");
    if (!variant.isActive || variant.product.archivedAt) throw new Error("Для архивного варианта доступна история движений; расчёт новых резервов отключён.");
    const local = localParts(now, branch.timezone);
    const tomorrow = zonedDateTimeToUtc(addLocalDays(local, 1), branch.timezone, local.hour, local.minute);
    const fromInput = input.from || formatBusinessLocalDateTimeInput(now, branch.timezone);
    const untilInput = input.until || formatBusinessLocalDateTimeInput(tomorrow, branch.timezone);
    const from = input.mode === "dates" ? parseBusinessLocalDateTime(fromInput, branch.timezone) : now;
    const until = input.mode === "dates" ? parseBusinessLocalDateTime(untilInput, branch.timezone) : new Date(now.getTime() + 1);
    if (until <= from) throw new Error("Окончание периода должно быть позже начала.");
    const scope = { organizationId: actor.organizationId, branchId: branch.id, productVariantId: variant.id };
    const availability = input.mode === "dates" ? await getVariantAvailabilityWithClient(tx, {
      tenant: createTenantContext(actor.organizationId), branchId: branch.id, productVariantId: variant.id, requestedFrom: from, requestedUntil: until,
    }) : null;
    const blockedFrom = availability?.effectiveBlockedFrom ?? from;
    const blockedUntil = availability?.effectiveBlockedUntil ?? until;
    // This is a read projection of existing allocations. The engine still owns
    // availability, interval buffering and peak calculations; no new reservation state.
    const allocations = await tx.capacityAllocation.findMany({
      where: { ...scope, status: "ACTIVE", blockedFrom: { lt: blockedUntil }, ...(input.mode === "now" ? { sourceType: "ORDER" as const } : {}) },
      select: { id: true, sourceType: true, quantity: true, issuedQuantity: true, returnedQuantity: true, blockedFrom: true, blockedUntil: true,
        maintenanceKind: true, order: { select: orderSelect }, productInstance: { select: { inventoryNumber: true } } },
      orderBy: [{ blockedFrom: "asc" }, { id: "asc" }],
    });
    const ids = allocations.map(row => row.id);
    const lossRows = variant.product.trackingMode === "BULK" && ids.length ? await tx.bulkPhysicalResolution.findMany({
      where: { organizationId: actor.organizationId, capacityAllocationId: { in: ids }, kind: "LOSS_RESOLUTION" }, select: { capacityAllocationId: true, totalQuantity: true },
    }) : [];
    const losses = new Map<string, number>();
    for (const row of lossRows) losses.set(row.capacityAllocationId, (losses.get(row.capacityAllocationId) ?? 0) + row.totalQuantity);
    const events = ids.length && input.mode === "dates" ? await tx.bulkMaintenanceEvent.findMany({
      where: { organizationId: actor.organizationId, capacityAllocationId: { in: ids } }, select: { capacityAllocationId: true, quantity: true },
    }) : [];
    const terminal = new Map<string, number>();
    for (const row of events) terminal.set(row.capacityAllocationId, (terminal.get(row.capacityAllocationId) ?? 0) + row.quantity);
    const visibleOrder = (order: typeof allocations[number]["order"]) => order?.organizationId === actor.organizationId && order.branchId === branch.id ? order : null;
    const rows = allocations.flatMap(row => {
      const segments = input.mode === "now"
        ? [{ from: row.blockedFrom, until: row.blockedUntil, quantity: Math.max(0, row.quantity - row.issuedQuantity) }]
        : buildCapacitySegments([row], variant.product.trackingMode, losses, terminal);
      const contributes = calculatePeakBlockedCapacity(segments, blockedFrom, blockedUntil);
      if (!contributes) return [];
      return [{ id: row.id, source: row.sourceType as string, order: visibleOrder(row.order), instance: row.productInstance?.inventoryNumber ?? null,
        from: row.blockedFrom, until: row.blockedUntil, quantity: row.quantity, issued: row.issuedQuantity, returned: row.returnedQuantity,
        loss: losses.get(row.id) ?? 0, contributes, maintenanceKind: row.maintenanceKind,
        overdueTail: row.sourceType === "ORDER" && variant.product.trackingMode === "BULK" && !!row.blockedUntil && row.blockedUntil <= blockedFrom }];
    });
    if (input.mode === "dates") {
      const sales = await tx.saleInventoryCommitment.findMany({ where: { ...scope, status: "ACTIVE", confirmedAt: { lt: blockedUntil } },
        select: { id: true, quantity: true, confirmedAt: true, order: { select: orderSelect }, productInstance: { select: { inventoryNumber: true } } } });
      for (const sale of sales) rows.push({ id: sale.id, source: "SALE", order: visibleOrder(sale.order), instance: sale.productInstance?.inventoryNumber ?? null,
        from: sale.confirmedAt, until: null, quantity: sale.quantity, issued: 0, returned: 0, loss: 0, contributes: sale.quantity, maintenanceKind: null, overdueTail: false });
    }
    rows.sort((a, b) => a.from.getTime() - b.from.getTime() || a.id.localeCompare(b.id));
    const total = rows.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(input.page, pages);
    const physical = variant.product.trackingMode === "BULK" ? (await warehouseStates(tx, actor.organizationId, [{ branchId: branch.id, productVariantId: variant.id,
      quantity: (await tx.stockLevel.aggregate({ where: scope, _sum: { quantity: true } }))._sum.quantity ?? 0 }], now))[0] : null;
    return { branch, variant, mode: input.mode, now, from, until, fromInput, untilInput, availability, physical,
      currentReservations: input.mode === "now" ? rows.reduce((sum, row) => sum + row.contributes, 0) : null,
      rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total, page, pages, first: total ? (page - 1) * PAGE_SIZE + 1 : 0, last: Math.min(page * PAGE_SIZE, total) };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}
