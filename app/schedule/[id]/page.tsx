import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ShiftForm } from "@/components/ShiftForm";
import { RetainedActionForm } from "@/components/RetainedActionForm";
import { cancelShiftAction } from "@/app/schedule/actions";
import { requireRouteAccess } from "@/lib/auth/session";
import { getShift, shiftOptions } from "@/lib/staff/shifts";
import { formatBusinessDateTime, formatBusinessLocalDateTimeInput } from "@/lib/calendar/timezone";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const actor = await requireRouteAccess("/schedule"), { id } = await params, query = await searchParams;
  const shift = await getShift(actor, id);
  if (!shift) notFound();
  const options = await shiftOptions(actor, shift.branchId), timezone = shift.branch.timezone;
  return <AppShell active="/schedule" title="Плановая смена"><Link href={`/schedule?branchId=${shift.branchId}`}>К графику</Link>{query.saved === "1" && <p role="status" className="notice">Изменения сохранены.</p>}
    <section className="card"><h2>{shift.assignedTo.user.displayName}</h2><p>{shift.branch.name} · {timezone}</p><p>{formatBusinessDateTime(shift.startsAt, timezone)} — {formatBusinessDateTime(shift.endsAt, timezone)}</p><p>{shift.status === "PLANNED" ? "Запланирована" : "Отменена"}</p></section>
    {options.canManage && shift.status === "PLANNED" && <><ShiftForm options={options} initial={{ id: shift.id, version: shift.version, assignedMembershipId: shift.assignedMembershipId, assigneeName: shift.assignedTo.user.displayName, startsAt: formatBusinessLocalDateTimeInput(shift.startsAt, timezone), endsAt: formatBusinessLocalDateTimeInput(shift.endsAt, timezone) }}/><RetainedActionForm action={cancelShiftAction} className="card"><input type="hidden" name="id" value={shift.id}/><input type="hidden" name="version" value={shift.version}/><p>Отмена сохранит запись в истории графика.</p><button className="secondary">Отменить смену</button></RetainedActionForm></>}
  </AppShell>;
}
