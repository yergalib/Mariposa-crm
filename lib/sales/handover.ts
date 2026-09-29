import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrderError } from "@/lib/orders/errors";
import { validateSaleHandoverSelections, type SaleHandoverSelection } from "@/lib/sales/handover-contract";
import { fulfillSale } from "@/lib/sales/lifecycle";
import type { TenantContext } from "@/lib/tenant/context";

type Actor = Pick<AuthContext, "userId" | "membershipId" | "role">;
export type { SaleHandoverSelection } from "@/lib/sales/handover-contract";

export async function fulfillVerifiedSale(
  tenant: TenantContext,
  orderId: string,
  selections: SaleHandoverSelection[],
  idempotencyKey: string,
  actor: Actor,
) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, organizationId: tenant.organizationId, type: "SALE", status: "CONFIRMED" },
      select: { saleInventoryCommitments: { where: { status: "ACTIVE" }, select: { productVariantId: true, productInstanceId: true, quantity: true } } },
    });
    if (!order) throw new OrderError("NOT_FOUND", "Продажа не найдена.");
    validateSaleHandoverSelections(order.saleInventoryCommitments, selections);
    return fulfillSale(tenant, orderId, idempotencyKey, actor, tx);
  }, { maxWait: 10_000, timeout: 60_000 });
}
