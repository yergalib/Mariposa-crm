"use server";
import { redirect } from "next/navigation";
import { acceptStaffInvitation } from "@/lib/staff/invitations";
import { getCurrentSession } from "@/lib/auth/session";
export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") || ""), password = String(formData.get("password") || ""), confirmation = formData.get("confirmation");
  if (confirmation !== null && password !== String(confirmation)) redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent("Пароли не совпадают.")}`);
  try {
    const session = await getCurrentSession();
    await acceptStaffInvitation(token, { password, existingUserId: session?.userId });
    redirect("/login?invited=1");
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(error instanceof Error ? error.message : "Приглашение недействительно.")}`);
  }
}
