import { OrderError } from "@/lib/orders/errors";

export type RentalHandoverSelection =
  | { kind: "BULK"; productVariantId: string; quantity: number }
  | { kind: "SERIALIZED"; productInstanceId: string };

type ExpectedAllocation = {
  productVariantId: string;
  productInstanceId: string | null;
  quantity: number;
  issuedQuantity: number;
};

export function validateRentalHandoverSelections(expected: ExpectedAllocation[], selections: RentalHandoverSelection[]) {
  const expectedBulk = new Map<string, number>();
  const expectedInstances = new Set<string>();
  for (const row of expected) {
    const outstanding = row.quantity - row.issuedQuantity;
    if (outstanding <= 0) continue;
    if (row.productInstanceId) expectedInstances.add(row.productInstanceId);
    else expectedBulk.set(row.productVariantId, (expectedBulk.get(row.productVariantId) ?? 0) + outstanding);
  }
  const selectedBulk = new Map<string, number>();
  const selectedInstances = new Set<string>();
  for (const row of selections) {
    if (row.kind === "BULK") {
      if (!Number.isInteger(row.quantity) || row.quantity < 1) throw new OrderError("VALIDATION", "Укажите корректное количество для выдачи.");
      selectedBulk.set(row.productVariantId, (selectedBulk.get(row.productVariantId) ?? 0) + row.quantity);
    } else {
      if (selectedInstances.has(row.productInstanceId)) throw new OrderError("VALIDATION", "Экземпляр отсканирован повторно.");
      selectedInstances.add(row.productInstanceId);
    }
  }
  if (expectedBulk.size !== selectedBulk.size || [...expectedBulk].some(([id, quantity]) => selectedBulk.get(id) !== quantity))
    throw new OrderError("VALIDATION", "Отсканированные количественные товары или количество не совпадают с заказом.");
  if (expectedInstances.size !== selectedInstances.size || [...expectedInstances].some((id) => !selectedInstances.has(id)))
    throw new OrderError("VALIDATION", "Отсканированные экземпляры не совпадают с назначенными экземплярами заказа.");
  return true;
}
