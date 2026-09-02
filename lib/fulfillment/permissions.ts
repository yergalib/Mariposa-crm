import type { AppRole, FulfillmentAction } from "@/lib/auth/access";
import { canPerformFulfillmentAction } from "@/lib/auth/access";
import { FulfillmentError } from "@/lib/fulfillment/errors";

export function requireFulfillmentPermission(role: AppRole, action: FulfillmentAction) {
  if (!canPerformFulfillmentAction(role, action))
    throw new FulfillmentError("FORBIDDEN", "Недостаточно прав для подготовки и выдачи заказа.");
}
