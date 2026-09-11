import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { defaultHasPermission, type PermissionKey } from "@/lib/permissions/registry";
import type { TenantContext } from "@/lib/tenant/context";

const ZERO = BigInt(0);
const BP_SCALE = BigInt(10_000);

export type EconomicsWarningCode =
  | "ALLOCATION_MOVEMENT_INSTANCE_MISMATCH"
  | "ISSUE_MOVEMENT_MISSING"
  | "CURRENCY_MISMATCH"
  | "UNKNOWN_ACQUISITION_COST"
  | "UNATTRIBUTED_RENTAL_REVENUE"
  | "INCOMPLETE_BRANCH_SCOPE"
  | "INCONSISTENT_RELATION";

export type EconomicsWarning = { code: EconomicsWarningCode; message: string };
export type CostOrigin = "PURCHASE" | "LEGACY" | "UNKNOWN" | "KNOWN_ZERO_COST";

export type EconomicsMoney = { amountMinor: string; currency: string };
export type EconomicsRatios = {
  rentalRemainingToPayback: EconomicsMoney;
  rentalPaybackBasisPoints: string | null;
  rentalReturnOverAcquisitionCost: EconomicsMoney;
  rentalReturnBasisPoints: string | null;
  totalRecoveryAccrued: EconomicsMoney;
  remainingToRecoverIncludingDamage: EconomicsMoney;
  recoveryIncludingDamageBasisPoints: string | null;
  recoveryOverAcquisitionCost: EconomicsMoney;
};

export type EconomicsCurrency = {
  currency: string;
  acquisitionCost?: EconomicsMoney;
  recordedBulkAcquisitions?: EconomicsMoney;
  rentalEarnedRevenue?: EconomicsMoney;
  activeRentalEarnedRevenue?: EconomicsMoney;
  completedRentalEarnedRevenue?: EconomicsMoney;
  damageCompensationAccrued?: EconomicsMoney;
  totalRecoveryAccrued?: EconomicsMoney;
  unattributedRentalRevenue?: EconomicsMoney;
  ratios?: EconomicsRatios | null;
};

export type InstanceRentalHistory = {
  allocationId: string;
  orderId: string;
  orderNumber: string;
  issuedAt: Date;
  returnedAt: Date | null;
  active: boolean;
  rentalEarnedRevenue?: EconomicsMoney;
  damageCompensationAccrued?: EconomicsMoney;
};

export type ProductInstanceEconomics = {
  id: string;
  productId: string;
  productVariantId: string;
  inventoryNumber: string;
  acquiredAt?: Date | null;
  costOrigin?: CostOrigin;
  acquisitionCost?: EconomicsMoney | null;
  issuedRentalCount: number;
  completedRentalCount: number;
  activeRentalCount: number;
  economicsByCurrency: EconomicsCurrency[];
  history: InstanceRentalHistory[];
  costCoverageComplete?: boolean;
  revenueAttributionComplete?: boolean;
  scopeComplete: boolean;
  integrityWarnings: EconomicsWarning[];
};

export type ProductVariantEconomics = {
  id: string;
  sku: string;
  size: string;
  trackingMode: "SERIALIZED" | "BULK";
  knownCostInstanceCount?: number;
  unknownCostInstanceCount?: number;
  costCoverageComplete?: boolean;
  revenueAttributionComplete?: boolean;
  scopeComplete: boolean;
  issuedRentalCount: number;
  completedRentalCount: number;
  activeRentalCount: number;
  issuedRentalQuantity: number;
  returnedRentalQuantity: number;
  rentalOrderCount: number;
  economicsByCurrency: EconomicsCurrency[];
  instances: ProductInstanceEconomics[];
  integrityWarnings: EconomicsWarning[];
};

export type ProductEconomics = {
  productId: string;
  trackingMode: "SERIALIZED" | "BULK";
  knownCostInstanceCount?: number;
  unknownCostInstanceCount?: number;
  costCoverageComplete?: boolean;
  revenueAttributionComplete?: boolean;
  scopeComplete: boolean;
  issuedRentalCount: number;
  completedRentalCount: number;
  activeRentalCount: number;
  issuedRentalQuantity: number;
  returnedRentalQuantity: number;
  rentalOrderCount: number;
  economicsByCurrency: EconomicsCurrency[];
  variants: ProductVariantEconomics[];
  integrityWarnings: EconomicsWarning[];
  permissions: { cost: boolean; margin: boolean; ratios: boolean };
};

export type ProductEconomicsSummary = {
  productId: string;
  name: string;
  issuedRentalQuantity: number;
  economicsByCurrency: Array<{ currency: string; rentalEarnedRevenue: EconomicsMoney; rentalPaybackBasisPoints: string | null }>;
  costCoverageComplete: boolean;
  revenueAttributionComplete: boolean;
  scopeComplete: boolean;
};

type Actor = Pick<AuthContext, "membershipId" | "role">;
type Amounts = Map<string, bigint>;

export function allocateMinorUnits(total: bigint, weightedIds: Array<{ id: string; weight: bigint }>) {
  const rows = weightedIds.filter((row) => row.weight > ZERO).sort((a, b) => a.id.localeCompare(b.id));
  const weightTotal = rows.reduce((sum, row) => sum + row.weight, ZERO);
  const result = new Map<string, bigint>(weightedIds.map((row) => [row.id, ZERO]));
  if (total === ZERO || weightTotal === ZERO) return { allocations: result, unattributed: weightTotal === ZERO ? total : ZERO };
  const sign = total < ZERO ? BigInt(-1) : BigInt(1);
  const absolute = total < ZERO ? -total : total;
  let attributed = ZERO;
  rows.forEach((row, index) => {
    const amount = index === rows.length - 1 ? absolute - attributed : absolute * row.weight / weightTotal;
    result.set(row.id, amount * sign);
    attributed += amount;
  });
  return { allocations: result, unattributed: ZERO };
}

function add(map: Amounts, currency: string, value: bigint) { map.set(currency, (map.get(currency) ?? ZERO) + value); }
function money(amount: bigint, currency: string): EconomicsMoney { return { amountMinor: amount.toString(), currency }; }
function ratioBp(numerator: bigint, denominator: bigint) { return denominator === ZERO ? null : (numerator * BP_SCALE / denominator).toString(); }
function ratios(cost: bigint, rental: bigint, damage: bigint, currency: string): EconomicsRatios | null {
  if (cost === ZERO) return null;
  const recovery = rental + damage;
  return {
    rentalRemainingToPayback: money(cost > rental ? cost - rental : ZERO, currency),
    rentalPaybackBasisPoints: ratioBp(rental, cost),
    rentalReturnOverAcquisitionCost: money(rental - cost, currency),
    rentalReturnBasisPoints: ratioBp(rental - cost, cost),
    totalRecoveryAccrued: money(recovery, currency),
    remainingToRecoverIncludingDamage: money(cost > recovery ? cost - recovery : ZERO, currency),
    recoveryIncludingDamageBasisPoints: ratioBp(recovery, cost),
    recoveryOverAcquisitionCost: money(recovery - cost, currency),
  };
}

function warning(code: EconomicsWarningCode): EconomicsWarning {
  const messages: Record<EconomicsWarningCode, string> = {
    ALLOCATION_MOVEMENT_INSTANCE_MISMATCH: "Экземпляр в выдаче не совпадает с текущим назначением.",
    ISSUE_MOVEMENT_MISSING: "Для выдачи не найдено подтверждающее движение склада.",
    CURRENCY_MISMATCH: "Обнаружено несоответствие валют связанных данных.",
    UNKNOWN_ACQUISITION_COST: "Стоимость приобретения известна не для всех экземпляров.",
    UNATTRIBUTED_RENTAL_REVENUE: "Часть начислений нельзя однозначно отнести к товару.",
    INCOMPLETE_BRANCH_SCOPE: "Доступна только часть истории по разрешённым филиалам.",
    INCONSISTENT_RELATION: "Связанные данные заказа, варианта или экземпляра не согласованы.",
  };
  return { code, message: messages[code] };
}

function uniqueWarnings(codes: Iterable<EconomicsWarningCode>) { return [...new Set(codes)].sort().map(warning); }
function visibleWarnings(codes: Iterable<EconomicsWarningCode>, showCost:boolean, showMargin:boolean){return uniqueWarnings([...codes].filter(code=>(code!=="UNKNOWN_ACQUISITION_COST"||showCost)&&(code!=="UNATTRIBUTED_RENTAL_REVENUE"||showMargin)&&(code!=="CURRENCY_MISMATCH"||(showCost&&showMargin))));}

async function permissionSnapshot(tx: Prisma.TransactionClient, tenant: TenantContext, actor: Actor) {
  const membership = await tx.organizationMembership.findFirst({
    where: { id: actor.membershipId, organizationId: tenant.organizationId, status: "ACTIVE" },
    select: { role: true },
  });
  if (!membership) return null;
  const branchAccess = await tx.membershipBranchAccess.findMany({ where: { organizationId: tenant.organizationId, membershipId: actor.membershipId, branch: { status: "ACTIVE" } }, select: { branchId: true } });
  const permissionOverrides = await tx.membershipPermissionOverride.findMany({ where: { organizationId: tenant.organizationId, membershipId: actor.membershipId }, select: { permissionKey: true, effect: true } });
  const has = (key: PermissionKey) => {
    if (membership.role === "OWNER") return true;
    const override = permissionOverrides.find((row) => row.permissionKey === key);
    return override ? override.effect === "ALLOW" : defaultHasPermission(membership.role, key);
  };
  const activeBranchCount = await tx.branch.count({ where: { organizationId: tenant.organizationId, status: "ACTIVE" } });
  return { owner: membership.role === "OWNER", branches: new Set(branchAccess.map((row) => row.branchId)), organizationWide: membership.role === "OWNER" || branchAccess.length === activeBranchCount, has };
}

function mapCurrencies(input: {
  currencies: Set<string>; cost: Amounts; bulkCost: Amounts; rental: Amounts; active: Amounts; completed: Amounts; damage: Amounts; unattributed: Amounts;
  showCost: boolean; showMargin: boolean; showRatios: boolean; ratioAllowed: boolean;
}) {
  const visibleCurrencies=new Set<string>();
  if(input.showCost){input.cost.forEach((_,currency)=>visibleCurrencies.add(currency));input.bulkCost.forEach((_,currency)=>visibleCurrencies.add(currency));}
  if(input.showMargin){input.rental.forEach((_,currency)=>visibleCurrencies.add(currency));input.active.forEach((_,currency)=>visibleCurrencies.add(currency));input.completed.forEach((_,currency)=>visibleCurrencies.add(currency));input.damage.forEach((_,currency)=>visibleCurrencies.add(currency));input.unattributed.forEach((_,currency)=>visibleCurrencies.add(currency));}
  return [...visibleCurrencies].sort().map((currency): EconomicsCurrency => {
    const cost = input.cost.get(currency) ?? ZERO, rental = input.rental.get(currency) ?? ZERO, damage = input.damage.get(currency) ?? ZERO;
    return {
      currency,
      ...(input.showCost ? { acquisitionCost: money(cost, currency), recordedBulkAcquisitions: money(input.bulkCost.get(currency) ?? ZERO, currency) } : {}),
      ...(input.showMargin ? {
        rentalEarnedRevenue: money(rental, currency), activeRentalEarnedRevenue: money(input.active.get(currency) ?? ZERO, currency),
        completedRentalEarnedRevenue: money(input.completed.get(currency) ?? ZERO, currency), damageCompensationAccrued: money(damage, currency),
        totalRecoveryAccrued: money(rental + damage, currency),
        unattributedRentalRevenue: money(input.unattributed.get(currency) ?? ZERO, currency),
      } : {}),
      ...(input.showRatios ? { ratios: input.ratioAllowed ? ratios(cost, rental, damage, currency) : null } : {}),
    };
  });
}

export async function calculateProductEconomicsWithClient(tx: Prisma.TransactionClient, tenant: TenantContext, requested: { productId?: string; productInstanceId?: string }, actor: Actor): Promise<ProductEconomics | null> {
    const access = await permissionSnapshot(tx, tenant, actor);
    if (!access || !access.has("CATALOG_VIEW")) return null;
    const org = tenant.organizationId;
    const resolvedProductId = requested.productId ?? (requested.productInstanceId ? (await tx.productInstance.findFirst({ where: { id: requested.productInstanceId, organizationId: org }, select: { productVariant: { select: { productId: true } } } }))?.productVariant.productId : undefined);
    if (!resolvedProductId) return null;
    const productRow = await tx.product.findFirst({ where: { id: resolvedProductId, organizationId: org }, select: { id: true, trackingMode: true } });
    if (!productRow) return null;
    const variantRows = await tx.productVariant.findMany({ where: { organizationId: org, productId: productRow.id }, select: { id: true, sku: true, sizeId: true }, orderBy: { id: "asc" } });
    const sizeRows = await tx.size.findMany({ where: { organizationId: org, id: { in: variantRows.map((row) => row.sizeId) } }, select: { id: true, code: true } });
    const instanceRows = await tx.productInstance.findMany({ where: { organizationId: org, productVariantId: { in: variantRows.map((row) => row.id) } }, select: { id: true, productVariantId: true, inventoryNumber: true, acquiredAt: true, purchaseCostMinor: true, currency: true, purchaseItemId: true, purchaseReceiptLineId: true, currentBranchId: true }, orderBy: { id: "asc" } });
    const bulkRows = await tx.bulkAcquisitionLayer.findMany({ where: { organizationId: org, productVariantId: { in: variantRows.map((row) => row.id) } }, select: { productVariantId: true, totalCostMinor: true, currency: true, purchaseReceiptLineId: true } });
    const receiptLineRows = await tx.purchaseReceiptLine.findMany({ where: { organizationId: org, id: { in: bulkRows.map((row) => row.purchaseReceiptLineId) } }, select: { id: true, purchaseReceiptId: true } });
    const receiptRows = await tx.purchaseReceipt.findMany({ where: { organizationId: org, id: { in: receiptLineRows.map((row) => row.purchaseReceiptId) } }, select: { id: true, branchId: true } });
    const sizes = new Map(sizeRows.map((row) => [row.id, row.code])), receiptLines = new Map(receiptLineRows.map((row) => [row.id, row.purchaseReceiptId])), receipts = new Map(receiptRows.map((row) => [row.id, row.branchId]));
    const product = { ...productRow, variants: variantRows.map((variant) => ({ id: variant.id, sku: variant.sku, size: { code: sizes.get(variant.sizeId) ?? "" }, instances: instanceRows.filter((row) => row.productVariantId === variant.id), bulkAcquisitionLayers: bulkRows.filter((row) => row.productVariantId === variant.id).map((row) => ({ totalCostMinor: row.totalCostMinor, currency: row.currency, purchaseReceiptLine: { purchaseReceipt: { branchId: receipts.get(receiptLines.get(row.purchaseReceiptLineId) ?? "") ?? "" } } })) })) };
    const variantIds = product.variants.map((variant) => variant.id);
    const allocations = await tx.capacityAllocation.findMany({
      where: { organizationId: org, productVariantId: { in: variantIds }, sourceType: "ORDER", issuedAt: { not: null }, issuedQuantity: { gt: 0 } },
      select: { id: true, organizationId: true, orderId: true, orderItemId: true, productVariantId: true, productInstanceId: true, branchId: true, quantity: true, issuedAt: true, issuedQuantity: true, returnedAt: true, returnedQuantity: true, returnInspectionResult: true },
      orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
    });
    const orderIds = [...new Set(allocations.flatMap((a) => a.orderId ? [a.orderId] : []))];
    const orders = await tx.order.findMany({ where: { organizationId: org, id: { in: orderIds }, type: "RENTAL" }, select: { id: true, orderNumber: true, branchId: true, currency: true, type: true, items: { where: { organizationId: org }, select: { id: true, organizationId: true, orderId: true, productVariantId: true, quantity: true, lineTotalMinor: true, currency: true, removedAt: true } } } });
    const movements = await tx.inventoryMovement.findMany({ where: { organizationId: org, type: "RENTAL_ISSUE", sourceType: "CAPACITY_ALLOCATION", sourceId: { in: allocations.map((a) => a.id) } }, select: { id: true, sourceId: true, productVariantId: true, productInstanceId: true, fromBranchId: true, quantity: true } });
    const transactions = await tx.financialTransaction.findMany({ where: { organizationId: org, revenueEffectMinor: { not: ZERO }, OR: [{ orderId: { in: orderIds } }, { reversalOf: { is: { orderId: { in: orderIds } } } }] }, select: { id: true, organizationId: true, branchId: true, orderId: true, kind: true, revenueEffectMinor: true, currency: true, sourceType: true, sourceId: true, reversalOfId: true, reversalOf: { select: { id: true, organizationId: true, branchId: true, orderId: true, kind: true, revenueEffectMinor: true, currency: true, sourceType: true, sourceId: true, reversalOfId: true } } } });
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const movementsByAllocation = new Map<string, typeof movements>();
    movements.forEach((movement) => { if (movement.sourceId) movementsByAllocation.set(movement.sourceId, [...(movementsByAllocation.get(movement.sourceId) ?? []), movement]); });
    const orderRental = new Map<string, Amounts>(), orderAmbiguous = new Map<string, Amounts>();
    for (const row of transactions) {
      const root = row.kind === "REVERSAL" ? row.reversalOf : row;
      if (!root) continue;
      const order = root.orderId ? ordersById.get(root.orderId) : undefined;
      if (!order || row.currency !== order.currency || root.currency !== order.currency || root.orderId !== order.id || row.branchId !== order.branchId) continue;
      const canonical = (root.kind === "RENTAL_CHARGE" || root.kind === "DISCOUNT") && root.sourceType === "ORDER_CHARGE" && root.sourceId === order.id;
      const ambiguous = !canonical && (root.kind === "RENTAL_CHARGE" || root.kind === "DISCOUNT");
      const target = canonical ? orderRental : ambiguous ? orderAmbiguous : null;
      if (target) { const amounts = target.get(order.id) ?? new Map<string, bigint>(); add(amounts, row.currency, row.revenueEffectMinor); target.set(order.id, amounts); }
    }
    const itemShares = new Map<string, Amounts>(), itemUnattributed = new Map<string, Amounts>();
    const orderIntegrityWarnings = new Map<string, Set<EconomicsWarningCode>>();
    for (const order of orders) {
      const currencies = new Set([...(orderRental.get(order.id)?.keys() ?? []), ...(orderAmbiguous.get(order.id)?.keys() ?? [])]);
      for (const currency of currencies) {
        const canonical = orderRental.get(order.id)?.get(currency) ?? ZERO;
        const currencyMismatch=order.items.some(item=>item.currency!==order.currency);
        if(currencyMismatch)orderIntegrityWarnings.set(order.id,new Set(["CURRENCY_MISMATCH"]));
        const weighted = order.items.map((item) => ({ id: item.id, weight: item.lineTotalMinor > ZERO ? item.lineTotalMinor : ZERO }));
        const allocation = currencyMismatch?{allocations:new Map(weighted.map(item=>[item.id,ZERO])),unattributed:canonical}:allocateMinorUnits(canonical, weighted);
        for (const [itemId, amount] of allocation.allocations) { const map = itemShares.get(itemId) ?? new Map<string, bigint>(); add(map, currency, amount); itemShares.set(itemId, map); }
        const missing = allocation.unattributed + (orderAmbiguous.get(order.id)?.get(currency) ?? ZERO);
        if (missing !== ZERO) { const map = itemUnattributed.get(order.id) ?? new Map<string, bigint>(); add(map, currency, missing); itemUnattributed.set(order.id, map); }
      }
    }

    type Mutable = { cost: Amounts; bulkCost: Amounts; rental: Amounts; active: Amounts; completed: Amounts; damage: Amounts; unattributed: Amounts; currencies: Set<string>; warnings: Set<EconomicsWarningCode>; issued: number; completedCount: number; activeCount: number; issuedQty: number; returnedQty: number; orders: Set<string> };
    const mutable = (): Mutable => ({ cost:new Map(),bulkCost:new Map(),rental:new Map(),active:new Map(),completed:new Map(),damage:new Map(),unattributed:new Map(),currencies:new Set(),warnings:new Set(),issued:0,completedCount:0,activeCount:0,issuedQty:0,returnedQty:0,orders:new Set() });
    const variants = new Map(product.variants.map((variant) => [variant.id, mutable()]));
    const instances = new Map<string, Mutable & { history: InstanceRentalHistory[] }>();
    product.variants.flatMap((variant) => variant.instances).forEach((instance) => instances.set(instance.id, { ...mutable(), history: [] }));
    const visible = (branchId: string) => access.owner || access.branches.has(branchId);
    let hiddenActivity = false;
    const productUnattributed: Amounts = new Map();
    const validSerialized = new Map<string, { allocation: typeof allocations[number]; instanceId: string; order: typeof orders[number]; item: typeof orders[number]["items"][number] }>();
    for (const allocation of allocations) {
      const variant = variants.get(allocation.productVariantId), order = allocation.orderId ? ordersById.get(allocation.orderId) : undefined;
      const item = order?.items.find((candidate) => candidate.id === allocation.orderItemId);
      if (!visible(allocation.branchId)) { hiddenActivity = true; continue; }
      if (!variant || !order || !item || item.orderId !== order.id || item.productVariantId !== allocation.productVariantId || item.organizationId !== org) { variant?.warnings.add("INCONSISTENT_RELATION"); continue; }
      const shareByCurrency = itemShares.get(item.id) ?? new Map<string,bigint>();
      const unitShares = new Map<string, bigint[]>();
      for (const [currency, share] of shareByCurrency) {
        const split = allocateMinorUnits(share, Array.from({length:item.quantity}, (_, index) => ({ id: String(index).padStart(9,"0"), weight: BigInt(1) }))).allocations;
        unitShares.set(currency, [...split.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,amount])=>amount));
      }
      const siblings = allocations.filter((row) => row.orderItemId === item.id && visible(row.branchId)).sort((a,b)=>(a.issuedAt?.getTime()??0)-(b.issuedAt?.getTime()??0)||a.id.localeCompare(b.id));
      const preceding = siblings.filter((row) => row.id.localeCompare(allocation.id) !== 0).filter((row) => (row.issuedAt?.getTime()??0)<(allocation.issuedAt?.getTime()??0)||((row.issuedAt?.getTime()??0)===(allocation.issuedAt?.getTime()??0)&&row.id<allocation.id)).reduce((sum,row)=>sum+row.issuedQuantity,0);
      const issuedQty = Math.min(allocation.issuedQuantity, Math.max(0, item.quantity - preceding));
      const returnedQty = Math.min(allocation.returnedQuantity, issuedQty);
      const markUnitUnattributed=()=>{for(const [currency,slices]of unitShares){const value=slices.slice(preceding,preceding+issuedQty).reduce((s,v)=>s+v,ZERO);add(variant.unattributed,currency,value);variant.currencies.add(currency);}}
      if (product.trackingMode === "SERIALIZED") {
        const issueMovements = movementsByAllocation.get(allocation.id) ?? [];
        const physical = issueMovements.length === 1 ? issueMovements[0] : undefined;
        if (!physical) { variant.warnings.add("ISSUE_MOVEMENT_MISSING"); markUnitUnattributed(); if(allocation.productInstanceId)instances.get(allocation.productInstanceId)?.warnings.add("ISSUE_MOVEMENT_MISSING"); continue; }
        if (!physical.productInstanceId || physical.productInstanceId !== allocation.productInstanceId || physical.productVariantId !== allocation.productVariantId || physical.fromBranchId !== allocation.branchId || physical.quantity !== -1 || issuedQty !== 1 || allocation.quantity !== 1) { variant.warnings.add("ALLOCATION_MOVEMENT_INSTANCE_MISMATCH"); markUnitUnattributed(); if(allocation.productInstanceId)instances.get(allocation.productInstanceId)?.warnings.add("ALLOCATION_MOVEMENT_INSTANCE_MISMATCH"); continue; }
        const instance = instances.get(physical.productInstanceId);
        if (!instance) { variant.warnings.add("INCONSISTENT_RELATION"); continue; }
        variant.issuedQty += 1; variant.returnedQty += returnedQty; variant.orders.add(order.id);
        validSerialized.set(allocation.id, { allocation, instanceId: physical.productInstanceId, order, item });
        instance.issued++; variant.issued++;
        const isCompleted = allocation.returnedQuantity >= allocation.issuedQuantity;
        if (isCompleted) { instance.completedCount++; variant.completedCount++; } else { instance.activeCount++; variant.activeCount++; }
        for (const [currency, slices] of unitShares) {
          const value=slices[preceding]??ZERO; add(instance.rental,currency,value); add(variant.rental,currency,value); add(isCompleted?instance.completed:instance.active,currency,value); add(isCompleted?variant.completed:variant.active,currency,value); instance.currencies.add(currency); variant.currencies.add(currency);
          instance.history.push({ allocationId: allocation.id, orderId: order.id, orderNumber: order.orderNumber, issuedAt: allocation.issuedAt!, returnedAt: allocation.returnedAt, active: !isCompleted, ...(access.has("FINANCE_MARGIN_VIEW") ? { rentalEarnedRevenue: money(value,currency) } : {}) });
        }
      } else {
        variant.issuedQty += issuedQty; variant.returnedQty += returnedQty; variant.orders.add(order.id);
        for (const [currency,slices] of unitShares) {
          const values=slices.slice(preceding, preceding+issuedQty); const total=values.reduce((s,v)=>s+v,ZERO); const done=values.slice(0,returnedQty).reduce((s,v)=>s+v,ZERO);
          add(variant.rental,currency,total); add(variant.completed,currency,done); add(variant.active,currency,total-done); variant.currencies.add(currency);
        }
      }
    }
    for(const [orderId,codes]of orderIntegrityWarnings){for(const allocation of allocations.filter(row=>row.orderId===orderId&&visible(row.branchId))){const target=variants.get(allocation.productVariantId);codes.forEach(code=>target?.warnings.add(code));}}
    for (const [orderId, amounts] of itemUnattributed) {
      const order=ordersById.get(orderId); if(!order)continue;
      const targetItems=order.items.filter(item=>variants.has(item.productVariantId));
      if(!targetItems.length)continue;
      targetItems.forEach(item=>variants.get(item.productVariantId)?.warnings.add("UNATTRIBUTED_RENTAL_REVENUE"));
      if(targetItems.length===order.items.length)for(const [currency,value] of amounts)add(productUnattributed,currency,value);
    }
    // Damage is attributed only through a physically verified serialized allocation.
    for (const row of transactions) {
      const root = row.kind === "REVERSAL" ? row.reversalOf : row;
      if (!root || root.kind !== "DAMAGE_CHARGE" || root.sourceType !== "RETURN_DAMAGE_ASSESSMENT" || !root.sourceId) continue;
      const valid = validSerialized.get(root.sourceId); if (!valid || valid.allocation.returnedAt===null || valid.allocation.returnInspectionResult!=="DAMAGED" || root.orderId !== valid.order.id || row.currency !== valid.order.currency || row.branchId !== valid.allocation.branchId) { if(valid)variants.get(valid.allocation.productVariantId)?.warnings.add("INCONSISTENT_RELATION"); continue; }
      const instance=instances.get(valid.instanceId)!, variant=variants.get(valid.allocation.productVariantId)!;
      add(instance.damage,row.currency,row.revenueEffectMinor); add(variant.damage,row.currency,row.revenueEffectMinor); instance.currencies.add(row.currency); variant.currencies.add(row.currency);
      const history=instance.history.find((entry)=>entry.allocationId===valid.allocation.id); if(history&&access.has("FINANCE_MARGIN_VIEW")) history.damageCompensationAccrued=money((BigInt(history.damageCompensationAccrued?.amountMinor??"0")+row.revenueEffectMinor),row.currency);
    }
    const showCost=access.has("FINANCE_PURCHASE_COST_VIEW"), showMargin=access.has("FINANCE_MARGIN_VIEW"), showRatios=showCost&&showMargin, showOrderHistory=access.has("ORDER_VIEW");
    const variantDtos: ProductVariantEconomics[] = product.variants.map((variant) => {
      const v=variants.get(variant.id)!;
      const scopedInstances=variant.instances.filter((instance)=>access.owner||access.branches.has(instance.currentBranchId));
      if(scopedInstances.length!==variant.instances.length)hiddenActivity=true;
      const instanceDtos: ProductInstanceEconomics[] = scopedInstances.map((instance)=>{
        const x=instances.get(instance.id)!; const known=instance.purchaseCostMinor!==null&&instance.currency!==null; const scopeComplete=access.organizationWide&&!hiddenActivity;
        if(known){add(x.cost,instance.currency!,instance.purchaseCostMinor!);x.currencies.add(instance.currency!);}else x.warnings.add("UNKNOWN_ACQUISITION_COST");
        if(known&&[...x.rental.keys(),...x.damage.keys()].some(currency=>currency!==instance.currency))x.warnings.add("CURRENCY_MISMATCH");
        if(!scopeComplete)x.warnings.add("INCOMPLETE_BRANCH_SCOPE");
        const revenueComplete=![...x.warnings].some(code=>["ALLOCATION_MOVEMENT_INSTANCE_MISMATCH","ISSUE_MOVEMENT_MISSING","CURRENCY_MISMATCH","UNATTRIBUTED_RENTAL_REVENUE","INCONSISTENT_RELATION"].includes(code));
        const complete=known&&revenueComplete&&scopeComplete;
        const origin:CostOrigin=instance.purchaseCostMinor===null?"UNKNOWN":instance.purchaseCostMinor===ZERO?"KNOWN_ZERO_COST":instance.purchaseItemId&&instance.purchaseReceiptLineId?"PURCHASE":"LEGACY";
        return {id:instance.id,productId:product.id,productVariantId:variant.id,inventoryNumber:instance.inventoryNumber,...(showCost?{acquiredAt:instance.acquiredAt,costOrigin:origin,acquisitionCost:known?money(instance.purchaseCostMinor!,instance.currency!):null,costCoverageComplete:known}:{}),...(showMargin?{revenueAttributionComplete:revenueComplete}:{}),issuedRentalCount:x.issued,completedRentalCount:x.completedCount,activeRentalCount:x.activeCount,economicsByCurrency:mapCurrencies({currencies:x.currencies,cost:x.cost,bulkCost:x.bulkCost,rental:x.rental,active:x.active,completed:x.completed,damage:x.damage,unattributed:x.unattributed,showCost,showMargin,showRatios,ratioAllowed:complete}),history:showOrderHistory?x.history.sort((a,b)=>b.issuedAt.getTime()-a.issuedAt.getTime()):[],scopeComplete,integrityWarnings:visibleWarnings(x.warnings,showCost,showMargin)};
      });
      const known=scopedInstances.filter((i)=>i.purchaseCostMinor!==null&&i.currency!==null).length, unknown=scopedInstances.length-known;
      for(const i of scopedInstances){if(i.purchaseCostMinor!==null&&i.currency){add(v.cost,i.currency,i.purchaseCostMinor);v.currencies.add(i.currency);}}
      for(const layer of variant.bulkAcquisitionLayers){if(visible(layer.purchaseReceiptLine.purchaseReceipt.branchId)){add(v.bulkCost,layer.currency,layer.totalCostMinor);v.currencies.add(layer.currency);}else hiddenActivity=true;}
      if(unknown)v.warnings.add("UNKNOWN_ACQUISITION_COST"); if(!access.organizationWide||hiddenActivity)v.warnings.add("INCOMPLETE_BRANCH_SCOPE");
      const costComplete=product.trackingMode==="SERIALIZED"&&unknown===0, revenueComplete=![...v.warnings].some(code=>["ALLOCATION_MOVEMENT_INSTANCE_MISMATCH","ISSUE_MOVEMENT_MISSING","CURRENCY_MISMATCH","UNATTRIBUTED_RENTAL_REVENUE","INCONSISTENT_RELATION"].includes(code))&&instanceDtos.every(instance=>instance.revenueAttributionComplete), scopeComplete=access.organizationWide&&!hiddenActivity;
      return {id:variant.id,sku:variant.sku,size:variant.size.code,trackingMode:product.trackingMode,...(showCost?{knownCostInstanceCount:known,unknownCostInstanceCount:unknown,costCoverageComplete:costComplete}:{}),...(showMargin?{revenueAttributionComplete:revenueComplete}:{}),scopeComplete,issuedRentalCount:v.issued,completedRentalCount:v.completedCount,activeRentalCount:v.activeCount,issuedRentalQuantity:v.issuedQty,returnedRentalQuantity:v.returnedQty,rentalOrderCount:v.orders.size,economicsByCurrency:mapCurrencies({currencies:v.currencies,cost:v.cost,bulkCost:v.bulkCost,rental:v.rental,active:v.active,completed:v.completed,damage:v.damage,unattributed:v.unattributed,showCost,showMargin,showRatios,ratioAllowed:costComplete&&revenueComplete&&scopeComplete&&product.trackingMode==="SERIALIZED"}),instances:instanceDtos,integrityWarnings:visibleWarnings(v.warnings,showCost,showMargin)};
    });
    const p=mutable(); for(const v of variantDtos){p.issued+=v.issuedRentalCount;p.completedCount+=v.completedRentalCount;p.activeCount+=v.activeRentalCount;p.issuedQty+=v.issuedRentalQuantity;p.returnedQty+=v.returnedRentalQuantity;v.integrityWarnings.forEach(w=>p.warnings.add(w.code));}
    const allCurrency=new Set([...variantDtos.flatMap(v=>v.economicsByCurrency.map(c=>c.currency)),...productUnattributed.keys()]);
    for(const currency of allCurrency)for(const v of variantDtos){const c=v.economicsByCurrency.find(row=>row.currency===currency);if(!c)continue;if(c.acquisitionCost)add(p.cost,currency,BigInt(c.acquisitionCost.amountMinor));if(c.recordedBulkAcquisitions)add(p.bulkCost,currency,BigInt(c.recordedBulkAcquisitions.amountMinor));if(c.rentalEarnedRevenue)add(p.rental,currency,BigInt(c.rentalEarnedRevenue.amountMinor));if(c.activeRentalEarnedRevenue)add(p.active,currency,BigInt(c.activeRentalEarnedRevenue.amountMinor));if(c.completedRentalEarnedRevenue)add(p.completed,currency,BigInt(c.completedRentalEarnedRevenue.amountMinor));if(c.damageCompensationAccrued)add(p.damage,currency,BigInt(c.damageCompensationAccrued.amountMinor));if(c.unattributedRentalRevenue)add(p.unattributed,currency,BigInt(c.unattributedRentalRevenue.amountMinor));}
    for(const [currency,value]of productUnattributed){add(p.unattributed,currency,value);p.warnings.add("UNATTRIBUTED_RENTAL_REVENUE");}
    const known=variantDtos.reduce((s,v)=>s+(v.knownCostInstanceCount??0),0),unknown=variantDtos.reduce((s,v)=>s+(v.unknownCostInstanceCount??0),0),costComplete=product.trackingMode==="SERIALIZED"&&unknown===0,revenueComplete=variantDtos.every(v=>v.revenueAttributionComplete===true)&&productUnattributed.size===0,scopeComplete=access.organizationWide&&!hiddenActivity;
    const productOrderCount=new Set(allocations.filter(a=>visible(a.branchId)&&a.orderId).map(a=>a.orderId!)).size;
    return {productId:product.id,trackingMode:product.trackingMode,...(showCost?{knownCostInstanceCount:known,unknownCostInstanceCount:unknown,costCoverageComplete:costComplete}:{}),...(showMargin?{revenueAttributionComplete:revenueComplete}:{}),scopeComplete,issuedRentalCount:p.issued,completedRentalCount:p.completedCount,activeRentalCount:p.activeCount,issuedRentalQuantity:p.issuedQty,returnedRentalQuantity:p.returnedQty,rentalOrderCount:productOrderCount,economicsByCurrency:mapCurrencies({currencies:allCurrency,cost:p.cost,bulkCost:p.bulkCost,rental:p.rental,active:p.active,completed:p.completed,damage:p.damage,unattributed:p.unattributed,showCost,showMargin,showRatios,ratioAllowed:costComplete&&revenueComplete&&scopeComplete&&product.trackingMode==="SERIALIZED"}),variants:variantDtos,integrityWarnings:visibleWarnings(p.warnings,showCost,showMargin),permissions:{cost:showCost,margin:showMargin,ratios:showRatios}};
}

export async function getProductEconomicsSummariesWithClient(tx: Prisma.TransactionClient, tenant: TenantContext, actor: Actor): Promise<ProductEconomicsSummary[]> {
  const access = await permissionSnapshot(tx, tenant, actor);
  if (!access || !access.has("CATALOG_VIEW") || !access.has("FINANCE_MARGIN_VIEW")) return [];
  const org = tenant.organizationId;
  const products = await tx.product.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true, trackingMode: true, variants: { where: { organizationId: org }, select: { id: true, instances: { where: { organizationId: org }, select: { id: true, currentBranchId: true, purchaseCostMinor: true, currency: true } } } } }, orderBy: { id: "asc" } });
  const variantToProduct = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, p.id] as const))), variantIds = [...variantToProduct.keys()];
  const allocations = variantIds.length ? await tx.capacityAllocation.findMany({ where: { organizationId: org, sourceType: "ORDER", issuedAt: { not: null }, issuedQuantity: { gt: 0 }, productVariantId: { in: variantIds } }, select: { id: true, orderId: true, orderItemId: true, productVariantId: true, productInstanceId: true, branchId: true, quantity: true, issuedQuantity: true, issuedAt: true }, orderBy: [{ issuedAt: "asc" }, { id: "asc" }] }) : [];
  const orderIds = [...new Set(allocations.flatMap((x) => x.orderId ? [x.orderId] : []))];
  const orders = await tx.order.findMany({ where: { organizationId: org, id: { in: orderIds }, type: "RENTAL" }, select: { id: true, branchId: true, currency: true, items: { where: { organizationId: org }, select: { id: true, orderId: true, productVariantId: true, quantity: true, lineTotalMinor: true, currency: true } } } });
  const movements = await tx.inventoryMovement.findMany({ where: { organizationId: org, type: "RENTAL_ISSUE", sourceType: "CAPACITY_ALLOCATION", sourceId: { in: allocations.map((x) => x.id) } }, select: { sourceId: true, productVariantId: true, productInstanceId: true, fromBranchId: true, quantity: true } });
  const transactions = await tx.financialTransaction.findMany({ where: { organizationId: org, revenueEffectMinor: { not: ZERO }, OR: [{ orderId: { in: orderIds } }, { reversalOf: { is: { orderId: { in: orderIds } } } }] }, select: { kind: true, orderId: true, branchId: true, currency: true, sourceType: true, sourceId: true, revenueEffectMinor: true, reversalOf: { select: { kind: true, orderId: true, branchId: true, currency: true, sourceType: true, sourceId: true } } } });
  const orderById = new Map(orders.map((x) => [x.id, x])), movementByAllocation = new Map<string, typeof movements>();
  movements.forEach((x) => { if (x.sourceId) movementByAllocation.set(x.sourceId, [...(movementByAllocation.get(x.sourceId) ?? []), x]); });
  const orderRevenue = new Map<string, Map<string, bigint>>(), incompleteProducts = new Set<string>();
  for (const row of transactions) { const root = row.kind === "REVERSAL" ? row.reversalOf : row, order = root?.orderId ? orderById.get(root.orderId) : undefined; if (!root || !order) continue; const canonical = (root.kind === "RENTAL_CHARGE" || root.kind === "DISCOUNT") && root.sourceType === "ORDER_CHARGE" && root.sourceId === order.id && row.branchId === order.branchId && row.currency === order.currency; if (!canonical) { order.items.forEach((x) => { const id = variantToProduct.get(x.productVariantId); if (id) incompleteProducts.add(id); }); continue; } const amounts = orderRevenue.get(order.id) ?? new Map(); add(amounts, row.currency, row.revenueEffectMinor); orderRevenue.set(order.id, amounts); }
  const totals = new Map(products.map((p) => [p.id, { rental: new Map<string, bigint>(), issued: 0 }]));
  const visible = (branchId: string) => access.owner || access.branches.has(branchId);
  for (const order of orders) for (const [currency, revenue] of orderRevenue.get(order.id) ?? []) {
    if (order.items.some((x) => x.currency !== order.currency)) { order.items.forEach((x) => { const id = variantToProduct.get(x.productVariantId); if (id) incompleteProducts.add(id); }); continue; }
    const itemAllocation = allocateMinorUnits(revenue, order.items.map((x) => ({ id: x.id, weight: x.lineTotalMinor > ZERO ? x.lineTotalMinor : ZERO })));
    for (const item of order.items) {
      const productId = variantToProduct.get(item.productVariantId); if (!productId) continue;
      const rows = allocations.filter((x) => x.orderItemId === item.id && visible(x.branchId));
      const unitAllocation = allocateMinorUnits(itemAllocation.allocations.get(item.id) ?? ZERO, Array.from({ length: item.quantity }, (_, n) => ({ id: `${String(n).padStart(8, "0")}`, weight: BigInt(1) })));
      let unit = 0;
      for (const allocation of rows) {
        const physical = movementByAllocation.get(allocation.id) ?? [], serialized = Boolean(allocation.productInstanceId);
        const valid = serialized ? physical.length === 1 && physical[0]!.productInstanceId === allocation.productInstanceId && physical[0]!.productVariantId === allocation.productVariantId && physical[0]!.fromBranchId === allocation.branchId && physical[0]!.quantity === -1 && allocation.issuedQuantity === 1 : physical.reduce((s, x) => s + Math.abs(x.quantity), 0) === allocation.issuedQuantity;
        if (!valid) { incompleteProducts.add(productId); unit += allocation.issuedQuantity; continue; }
        const target = totals.get(productId)!; target.issued += allocation.issuedQuantity;
        for (let n = 0; n < allocation.issuedQuantity && unit < item.quantity; n++, unit++) add(target.rental, currency, unitAllocation.allocations.get(`${String(unit).padStart(8, "0")}`) ?? ZERO);
      }
    }
  }
  return products.map((product) => {
    const value = totals.get(product.id)!, visibleInstances = product.variants.flatMap((x) => x.instances).filter((x) => access.owner || access.branches.has(x.currentBranchId)), allInstances = product.variants.flatMap((x) => x.instances), known = visibleInstances.every((x) => x.purchaseCostMinor !== null && x.currency !== null), scopeComplete = access.organizationWide && visibleInstances.length === allInstances.length, costs = new Map<string, bigint>();
    visibleInstances.forEach((x) => { if (x.purchaseCostMinor !== null && x.currency) add(costs, x.currency, x.purchaseCostMinor); });
    const currencies = new Set([...value.rental.keys(), ...costs.keys()]);
    return { productId: product.id, name: product.name, issuedRentalQuantity: value.issued, economicsByCurrency: [...currencies].sort().map((currency) => { const rental = value.rental.get(currency) ?? ZERO, cost = costs.get(currency); return { currency, rentalEarnedRevenue: money(rental, currency), rentalPaybackBasisPoints: access.has("FINANCE_PURCHASE_COST_VIEW") && known && scopeComplete && !incompleteProducts.has(product.id) && cost !== undefined && cost !== ZERO ? ratioBp(rental, cost) : null }; }), costCoverageComplete: known, revenueAttributionComplete: !incompleteProducts.has(product.id), scopeComplete };
  });
}

async function calculateProductEconomics(tenant: TenantContext, requested: { productId?: string; productInstanceId?: string }, actor: Actor): Promise<ProductEconomics | null> {
  return db.$transaction((tx) => calculateProductEconomicsWithClient(tx, tenant, requested, actor), { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 });
}

export function getProductEconomics(tenant: TenantContext, productId: string, actor: Actor) {
  return calculateProductEconomics(tenant,{productId},actor);
}

export async function getProductInstanceEconomics(tenant: TenantContext, productInstanceId: string, actor: Actor) {
  const product=await calculateProductEconomics(tenant,{productInstanceId},actor);
  return product?.variants.flatMap(variant=>variant.instances).find(row=>row.id===productInstanceId)??null;
}
