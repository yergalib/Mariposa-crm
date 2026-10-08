import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { workflowScope, type WorkflowActor } from "@/lib/workflow-access";

// Read actual SALE_ISSUE movements, never infer handover from order status.
export async function getSalePrint(actor: WorkflowActor, orderId: string) {
  if (!z.string().uuid().safeParse(orderId).success) return null;
  return db.$transaction(async tx => {
    const access = await workflowScope(tx, actor, ["ORDER_VIEW"]);
    return tx.order.findFirst({
      where: { ...access.where, id: orderId, type: "SALE", branch: { organizationId: actor.organizationId, status: "ACTIVE" }, organization: { status: "ACTIVE" } },
      select: {
        orderNumber: true, status: true,
        customer: { select: { firstName: true, lastName: true, middleName: true } },
        branch: { select: { name: true, timezone: true } },
        items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          where: { organizationId: actor.organizationId },
          select: { id: true, productNameSnapshot: true, variantNameSnapshot: true, skuSnapshot: true, quantity: true, removedAt: true,
            saleInventoryCommitments: { where: { organizationId: actor.organizationId },
              select: { id: true, productInstance: { select: { inventoryNumber: true, barcode: true } },
                inventoryMovements: { where: { organizationId: actor.organizationId, type: "SALE_ISSUE", quantity: { lt: 0 } },
                  orderBy: [{ occurredAt: "asc" }, { id: "asc" }], select: { quantity: true, occurredAt: true } }
              } }
          } }
      }
    });
  }, { isolationLevel: "RepeatableRead" });
}

export function saleIssuedQuantity(commitments: { inventoryMovements: { quantity: number }[] }[]) {
  return commitments.reduce((sum, row) => sum + row.inventoryMovements.reduce((n, movement) => n + Math.max(0, -movement.quantity), 0), 0);
}
