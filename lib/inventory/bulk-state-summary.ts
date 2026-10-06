import { calculatePeakBlockedCapacity } from "@/lib/availability/capacity";

type OrderAllocation = { id: string; quantity: number; issuedQuantity: number; returnedQuantity: number; status: string; blockedFrom: Date; blockedUntil: Date | null };
type Maintenance = { id: string; quantity: number; maintenanceKind: string | null };

// Existing operational projection, shared by the single-item view and warehouse.
// These columns overlap; this is not a new availability calculation.
export function summarizeBulkState(physicalOnHand: number, orders: OrderAllocation[], maintenance: Maintenance[], losses: ReadonlyMap<string, number>, terminal: ReadonlyMap<string, number>, from: Date, until: Date) {
  const issuedOutstanding = orders.reduce((sum, row) => sum + Math.max(0, row.issuedQuantity - row.returnedQuantity - (losses.get(row.id) ?? 0)), 0);
  let cleaning = 0, repair = 0, unclassifiedMaintenance = 0;
  for (const row of maintenance) {
    const remaining = Math.max(0, row.quantity - (terminal.get(row.id) ?? 0));
    if (row.maintenanceKind === "CLEANING") cleaning += remaining;
    else if (row.maintenanceKind === "REPAIR") repair += remaining;
    else unclassifiedMaintenance += remaining;
  }
  const plannedReservations = calculatePeakBlockedCapacity(orders.filter(row => row.status === "ACTIVE").map(row => ({ from: row.blockedFrom, until: row.blockedUntil, quantity: Math.max(0, row.quantity - row.issuedQuantity) })), from, until);
  return { physicalOnHand, issuedOutstanding, activeFleet: physicalOnHand + issuedOutstanding,
    serviceableOnHand: Math.max(0, physicalOnHand - cleaning - repair), cleaning, repair, unclassifiedMaintenance, plannedReservations };
}
