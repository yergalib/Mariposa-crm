import 'server-only';
import { db } from '@/lib/db';
import type { TenantContext } from '@/lib/tenant/context';
import { ResourceNotFoundError } from './errors';
import { calculateEffectiveInterval } from './interval';
import { buildCapacitySegments, calculatePeakBlockedCapacity, type DatabaseClient, type VariantAvailability } from './capacity';

const permanent = ['SOLD', 'WRITTEN_OFF', 'LOST'] as const;
const temporary = ['PICKING', 'READY_FOR_PICKUP', 'RENTED', 'RETURN_INSPECTION', 'CLEANING', 'REPAIR', 'IN_TRANSFER'] as const;
type Input = { tenant: TenantContext; branchId: string; variantIds: string[]; requestedFrom: Date; requestedUntil: Date };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Read projection only. Fresh data per call, bounded to 32 variants; no reservation or cache.
// Exported client boundary permits offline equivalence tests; production uses db below.
export async function readAvailabilityBatch(client: DatabaseClient, input: Input): Promise<Map<string, VariantAvailability>> {
  const organizationId = input.tenant.organizationId, branchId = input.branchId;
  const ids = [...new Set(input.variantIds)];
  if (ids.length > 32 || [organizationId, branchId, ...ids].some(id => !uuid.test(id))) throw new ResourceNotFoundError();
  if (!ids.length) return new Map();
  const [variants, branch, settings] = await Promise.all([
    client.productVariant.findMany({ where: { organizationId, id: { in: ids }, isActive: true, product: { organizationId, archivedAt: null } }, select: { id: true, product: { select: { trackingMode: true, turnaroundBufferMinutes: true } } } }),
    client.branch.findFirst({ where: { id: branchId, organizationId, status: 'ACTIVE' }, select: { id: true } }),
    client.organizationSettings.findUnique({ where: { organizationId }, select: { turnaroundBufferMinutes: true } })
  ]);
  if (!branch || variants.length !== ids.length) throw new ResourceNotFoundError();
  const intervals = new Map(variants.map(v => {
    const buffer = v.product.turnaroundBufferMinutes ?? settings?.turnaroundBufferMinutes ?? 0;
    if (!Number.isInteger(buffer) || buffer < 0) throw new ResourceNotFoundError();
    return [v.id, calculateEffectiveInterval({ requestedFrom: input.requestedFrom, requestedUntil: input.requestedUntil, turnaroundBufferMinutes: buffer, allowOpenEnded: false })];
  }));
  const from = new Date(Math.min(...[...intervals.values()].map(i => i.effectiveBlockedFrom.getTime())));
  const until = new Date(Math.max(...[...intervals.values()].map(i => i.effectiveBlockedUntil!.getTime())));
  const serialized = variants.filter(v => v.product.trackingMode === 'SERIALIZED').map(v => v.id);
  const bulk = variants.filter(v => v.product.trackingMode === 'BULK').map(v => v.id);
  const now = new Date();
  const [instances, stocks, active, issued, unavailable, sales] = await Promise.all([
    serialized.length ? client.productInstance.groupBy({ by: ['productVariantId'], where: { organizationId, productVariantId: { in: serialized }, currentBranchId: branchId, retiredAt: null, operationalStatus: { notIn: [...permanent] } }, _count: { _all: true } }) : [],
    bulk.length ? client.stockLevel.groupBy({ by: ['productVariantId'], where: { organizationId, productVariantId: { in: bulk }, branchId }, _sum: { quantity: true } }) : [],
    client.capacityAllocation.findMany({ where: { organizationId, branchId, productVariantId: { in: ids }, status: 'ACTIVE', blockedFrom: { lt: until }, OR: [{ sourceType: 'MAINTENANCE' }, { blockedUntil: null }, { blockedUntil: { gt: from } }, { productVariantId: { in: bulk }, issuedQuantity: { gt: 0 } }] }, select: { id: true, productVariantId: true, sourceType: true, quantity: true, blockedFrom: true, blockedUntil: true, issuedQuantity: true, returnedQuantity: true } }),
    bulk.length ? client.capacityAllocation.findMany({ where: { organizationId, branchId, productVariantId: { in: bulk }, issuedQuantity: { gt: 0 } }, select: { id: true, productVariantId: true, issuedQuantity: true, returnedQuantity: true } }) : [],
    serialized.length ? client.productInstance.groupBy({ by: ['productVariantId'], where: { organizationId, productVariantId: { in: serialized }, currentBranchId: branchId, retiredAt: null, operationalStatus: { in: [...temporary] }, capacityAllocations: { none: { organizationId, status: 'ACTIVE', blockedFrom: { lte: now }, OR: [{ blockedUntil: null }, { blockedUntil: { gt: now } }] } } }, _count: { _all: true } }) : [],
    client.saleInventoryCommitment.findMany({ where: { organizationId, branchId, productVariantId: { in: ids }, status: 'ACTIVE', confirmedAt: { lt: until } }, select: { productVariantId: true, confirmedAt: true, quantity: true } })
  ]);
  const activeIds = active.map(a => a.id);
  const lossIds = [...new Set([...active.filter(a => bulk.includes(a.productVariantId)).map(a => a.id), ...issued.map(a => a.id)])];
  const [losses, maintenance] = await Promise.all([
    lossIds.length ? client.bulkPhysicalResolution.findMany({ where: { organizationId, capacityAllocationId: { in: lossIds }, kind: 'LOSS_RESOLUTION' }, select: { capacityAllocationId: true, totalQuantity: true } }) : [],
    activeIds.length ? client.bulkMaintenanceEvent.findMany({ where: { organizationId, capacityAllocationId: { in: activeIds } }, select: { capacityAllocationId: true, quantity: true } }) : []
  ]);
  const lossMap = new Map<string, number>(), maintenanceMap = new Map<string, number>();
  for (const l of losses) lossMap.set(l.capacityAllocationId, (lossMap.get(l.capacityAllocationId) ?? 0) + l.totalQuantity);
  for (const m of maintenance) maintenanceMap.set(m.capacityAllocationId, (maintenanceMap.get(m.capacityAllocationId) ?? 0) + m.quantity);
  return new Map(variants.map(v => {
    const interval = intervals.get(v.id)!, trackingMode = v.product.trackingMode;
    // Broad batch bounds are narrowed back to each variant's exact turnaround interval.
    const allocations = active.filter(a => a.productVariantId === v.id && a.blockedFrom < interval.effectiveBlockedUntil! && (a.sourceType === 'MAINTENANCE' || a.blockedUntil === null || a.blockedUntil > interval.effectiveBlockedFrom || (trackingMode === 'BULK' && a.issuedQuantity > 0)));
    const segments = buildCapacitySegments(allocations, trackingMode, trackingMode === 'BULK' ? lossMap : new Map(), maintenanceMap);
    for (const sale of sales) if (sale.productVariantId === v.id && sale.confirmedAt < interval.effectiveBlockedUntil!) segments.push({ from: sale.confirmedAt, until: null, quantity: sale.quantity });
    const reservedCapacity = calculatePeakBlockedCapacity(segments, interval.effectiveBlockedFrom, interval.effectiveBlockedUntil);
    const onHand = trackingMode === 'SERIALIZED' ? instances.find(r => r.productVariantId === v.id)?._count._all ?? 0 : stocks.find(r => r.productVariantId === v.id)?._sum.quantity ?? 0;
    const outstanding = issued.filter(a => a.productVariantId === v.id).reduce((sum, a) => sum + Math.max(0, a.issuedQuantity - a.returnedQuantity - (lossMap.get(a.id) ?? 0)), 0);
    const totalCapacity = onHand + outstanding;
    const untrackedUnavailableCapacity = unavailable.find(r => r.productVariantId === v.id)?._count._all ?? 0;
    const availableCapacity = Math.max(0, totalCapacity - reservedCapacity - untrackedUnavailableCapacity);
    return [v.id, { trackingMode, totalCapacity, reservedCapacity, untrackedUnavailableCapacity, availableCapacity, requestedQuantity: 1, canFulfill: availableCapacity >= 1, ...interval }];
  }));
}

export async function getCatalogAvailability(input: Input) {
  const result = new Map<string, VariantAvailability>();
  for (let offset = 0; offset < input.variantIds.length; offset += 32) {
    const batch = await readAvailabilityBatch(db, { ...input, variantIds: input.variantIds.slice(offset, offset + 32) });
    for (const [id, value] of batch) result.set(id, value);
  }
  return result;
}
