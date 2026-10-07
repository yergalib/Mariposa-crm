import "server-only";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions/effective";
import type { AuthContext } from "@/lib/auth/session";

/** Resolve only an active customer in the current organization; never trust URL fields. */
export async function getOrderCustomerPrefill(session: AuthContext, id?: string) {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  await requirePermission(session, "CUSTOMER_VIEW");
  await requirePermission(session, "ORDER_CREATE");
  return db.customer.findFirst({ where: { id, organizationId: session.organizationId, status: "ACTIVE" },
    select: { id: true, customerNumber: true, firstName: true, lastName: true,
      contacts: { select: { value: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } } });
}
