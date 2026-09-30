import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RentalReturnIntake } from "@/components/RentalReturnIntake";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { getRentalReturnIntake } from "@/lib/fulfillment/return-intake";
import { requireBranchAccess } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";

export default async function RentalReturnPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ allocation?: string; barcode?: string; error?: string }> }) {
  const session = await requireRouteAccess("/returns"), { orderId } = await params, query = await searchParams, tenant = createTenantContext(session.organizationId);
  await requirePermission(session, "RETURN_PROCESS");
  let context: Awaited<ReturnType<typeof getRentalReturnIntake>>;
  try { context = await getRentalReturnIntake(tenant, orderId); } catch { notFound(); }
  await requireBranchAccess(tenant, session.membershipId, context.order.branchId);
  return <AppShell active="/returns" title="Приём возврата" subtitle={`${context.order.orderNumber} · ${context.order.customerName}`}>
    {query.error && <p className="notice error">{query.error}</p>}
    <RentalReturnIntake order={context.order} items={context.items} locations={context.locations} initialAllocationId={query.allocation} initialBarcode={query.barcode} operationKey={randomUUID()}/>
  </AppShell>;
}
