import { memberHasPermission, permissionMemberSelect } from "@/lib/permissions/member";
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { type PermissionKey } from "@/lib/permissions/registry";
import { OrderError } from "./errors";

type Actor = { userId?: string; membershipId?: string };
export async function requireCommercialPermission(tx: Prisma.TransactionClient, organizationId: string, actor: Actor, key: PermissionKey) {
  if (!actor.userId) throw new OrderError("FORBIDDEN", "Для изменения цены или скидки нужен сотрудник.");
  const member = await tx.organizationMembership.findFirst({
    where: { organizationId, userId: actor.userId, ...(actor.membershipId ? { id: actor.membershipId } : {}), status: "ACTIVE", user: { status: "ACTIVE" } },
    select: { ...permissionMemberSelect },
  });
  if (!member || !memberHasPermission(member, key))
    throw new OrderError("FORBIDDEN", key === "ORDER_PRICE_OVERRIDE" ? "Нет права изменять цену заказа." : "Нет права изменять скидку заказа.");
}

export async function guardCommercialChange(tx: Prisma.TransactionClient, organizationId: string, actor: Actor, input: {
  price?: bigint; referencePrice?: bigint; discount: bigint; previousDiscount?: bigint;
}) {
  if (input.price !== undefined && input.price !== input.referencePrice)
    await requireCommercialPermission(tx, organizationId, actor, "ORDER_PRICE_OVERRIDE");
  if (input.discount !== (input.previousDiscount ?? BigInt(0)))
    await requireCommercialPermission(tx, organizationId, actor, "ORDER_DISCOUNT_MANAGE");
}
