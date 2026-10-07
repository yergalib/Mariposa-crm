"use server";
import {redirectWithOrderContext} from "@/lib/orders/action-navigation";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { documentsNotInstalled, RentalDocumentError, saveRentalDocument } from "@/lib/orders/documents";

export type SaveDocumentState = { error: string | null };
export async function saveDocumentAction(orderId: string, _state: SaveDocumentState, form: FormData): Promise<SaveDocumentState> {
  const session = await requireRouteAccess("/orders");
  let documentId: string;
  try {
    documentId = await saveRentalDocument(session, {
      orderId, idempotencyKey: String(form.get("idempotencyKey") ?? ""),
      baseVersion: Number(form.get("baseVersion")), reason: String(form.get("reason") ?? "")
    });
  } catch (error) {
    unstable_rethrow(error);
    return { error: documentsNotInstalled(error) ? "Сохранение документов пока не включено. Требуется согласованное обновление базы данных."
      : error instanceof RentalDocumentError ? error.message : "Не удалось сохранить документ. Повторите запрос; повторная отправка этой формы не создаст дубликат." };
  }
  revalidatePath(`/orders/${orderId}/documents`);
  return redirectWithOrderContext(`/orders/${orderId}/documents/${documentId}`);
}
