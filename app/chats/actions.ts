"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { createInquiry, updateInquiry, InquiryError, inquiriesNotInstalled } from "@/lib/inquiries/service";

export type InquiryFormState = { error: string | null };
export async function saveInquiryAction(id: string | null, _state: InquiryFormState, form: FormData): Promise<InquiryFormState> {
  const session = await requireRouteAccess("/chats");
  const value = (key: string) => String(form.get(key) ?? "");
  const fields = { subject: value("subject"), customerLabel: value("customerLabel"), requestText: value("requestText"),
    ...(form.has("replyContact") ? { replyContact: value("replyContact") } : {}),
    requestedSize: value("requestedSize"), requestedFrom: value("requestedFrom"), requestedUntil: value("requestedUntil"),
    nextAction: value("nextAction"), nextActionAt: value("nextActionAt"), assignedMembershipId: value("assignedMembershipId") };
  let saved: string;
  try {
    saved = id ? await updateInquiry(session, { ...fields, id, version: Number(value("version")), status: value("status") })
      : await createInquiry(session, { ...fields, branchId: value("branchId"), source: value("source"), creationKey: value("creationKey"), variantIds: form.getAll("variantIds").map(String) });
  } catch (error) {
    unstable_rethrow(error);
    return { error: inquiriesNotInstalled(error) ? "Очередь пока не включена: требуется согласованное обновление базы данных."
      : error instanceof InquiryError ? error.message : "Сохранить обращение не удалось. Проверьте доступ и повторите запрос." };
  }
  revalidatePath("/chats");
  revalidatePath(`/chats/${saved}`);
  redirect(`/chats/${saved}`);
}
