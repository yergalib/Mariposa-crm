import { OrderError } from "@/lib/orders/errors";

export type SaleHandoverSelection =
  | { kind: "BULK"; productVariantId: string; quantity: number }
  | { kind: "SERIALIZED"; productInstanceId: string };

type ExpectedCommitment = { productVariantId: string; productInstanceId: string | null; quantity: number };

export function validateSaleHandoverSelections(expected: ExpectedCommitment[], selections: SaleHandoverSelection[]) {
  const expectedBulk = new Map<string, number>();
  const expectedInstances = new Set<string>();
  for (const row of expected) {
    if (row.productInstanceId) expectedInstances.add(row.productInstanceId);
    else expectedBulk.set(row.productVariantId, (expectedBulk.get(row.productVariantId) ?? 0) + row.quantity);
  }
  const selectedBulk = new Map<string, number>();
  const selectedInstances = new Set<string>();
  for (const row of selections) {
    if (row.kind === "BULK") {
      if (!Number.isInteger(row.quantity) || row.quantity < 1) throw new OrderError("VALIDATION", "Некорректное количество для передачи.");
      selectedBulk.set(row.productVariantId, (selectedBulk.get(row.productVariantId) ?? 0) + row.quantity);
    } else {
      if (selectedInstances.has(row.productInstanceId)) throw new OrderError("VALIDATION", "Экземпляр отсканирован повторно.");
      selectedInstances.add(row.productInstanceId);
    }
  }
  if (expectedBulk.size !== selectedBulk.size || [...expectedBulk].some(([id, quantity]) => selectedBulk.get(id) !== quantity))
    throw new OrderError("VALIDATION", "Отсканированные количественные товары не совпадают с продажей.");
  if (expectedInstances.size !== selectedInstances.size || [...expectedInstances].some((id) => !selectedInstances.has(id)))
    throw new OrderError("VALIDATION", "Отсканированные экземпляры не совпадают с продажей.");
  return true;
}
