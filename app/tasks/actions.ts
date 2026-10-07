"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTask, updateTask, setTaskStatus, taskOptions } from "@/lib/tasks/service";
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
export async function saveTaskAction(form: FormData) {
  let id: string;
  try {
    const session = await requireRouteAccess("/tasks");
    const fields = Object.fromEntries(["title", "description", "branchId", "assignedMembershipId", "dueAt", "customerId", "orderId"].map(key => [key, value(form, key)]));
    id = value(form, "id") ? await updateTask(session, { ...fields, id: value(form, "id"), version: Number(value(form, "version")) })
      : await createTask(session, { ...fields, creationKey: value(form, "creationKey") });
  } catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Не удалось сохранить задачу." }; }
  revalidatePath("/tasks", "layout");
  redirect(`/tasks/${id}?saved=1`);
}
export async function taskStatusAction(form: FormData) {
  let id: string;
  try { id = await setTaskStatus(await requireRouteAccess("/tasks"), { id: value(form, "id"), version: Number(value(form, "version")), status: value(form, "status") }); }
  catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Не удалось изменить статус." }; }
  revalidatePath("/tasks", "layout");
  redirect(`/tasks/${id}?saved=1`);
}
export async function searchTaskReferences(branchId: string, query: string) {
  try {
    const options = await taskOptions(await requireRouteAccess("/tasks"), branchId, query);
    return { customers: options.customers, orders: options.orders };
  } catch (error) { unstable_rethrow(error); return { error: "Поиск связей недоступен." }; }
}
