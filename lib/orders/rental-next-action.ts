export type RentalNextAction = "RESERVE" | "CONFIRM" | "PAY" | "ASSIGN" | "PREPARE" | "ISSUE" | "RETURN" | "COMPLETE" | "NONE";

export function deriveRentalNextAction(input: { status: string; ready: boolean; issuedQuantity: number; returnedQuantity: number; outstandingMinor: bigint | null; fullyAssigned: boolean }): RentalNextAction {
  if (input.status === "DRAFT") return "RESERVE";
  if (input.status === "RESERVED") return "CONFIRM";
  if (input.status === "COMPLETED" || input.status === "CANCELLED") return "NONE";
  if (input.issuedQuantity > input.returnedQuantity) return "RETURN";
  if (input.issuedQuantity > 0 && input.issuedQuantity === input.returnedQuantity) return "COMPLETE";
  if (input.status !== "CONFIRMED") return "NONE";
  if (input.outstandingMinor !== null && input.outstandingMinor > BigInt(0)) return "PAY";
  if (!input.fullyAssigned) return "ASSIGN";
  if (!input.ready) return "PREPARE";
  return "ISSUE";
}

export const RENTAL_NEXT_ACTION_LABEL: Record<RentalNextAction, string> = {
  RESERVE: "Зарезервировать",
  CONFIRM: "Подтвердить бронь",
  PAY: "Принять оплату",
  ASSIGN: "Назначить экземпляры",
  PREPARE: "Подготовить заказ",
  ISSUE: "Проверить и выдать",
  RETURN: "Ожидается возврат",
  COMPLETE: "Завершить возврат",
  NONE: "Действий не требуется",
};
