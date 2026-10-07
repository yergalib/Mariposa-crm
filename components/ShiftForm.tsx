import { RetainedActionForm } from "@/components/RetainedActionForm";
import { saveShiftAction } from "@/app/schedule/actions";
import type { shiftOptions } from "@/lib/staff/shifts";
export function ShiftForm({ options, creationKey, initial }: { options: Awaited<ReturnType<typeof shiftOptions>>; creationKey?: string; initial?: { id: string; version: number; assignedMembershipId: string; assigneeName: string; startsAt: string; endsAt: string } }) {
  if (!options.branch || !options.canManage) return null;
  return <RetainedActionForm action={saveShiftAction} className="card form-grid shift-form">
    <input type="hidden" name="branchId" value={options.branch.id}/>
    {initial ? <><input type="hidden" name="id" value={initial.id}/><input type="hidden" name="version" value={initial.version}/></> : <input type="hidden" name="creationKey" value={creationKey}/>}
    <label>Сотрудник<select name="assignedMembershipId" defaultValue={initial?.assignedMembershipId ?? ""} required><option value="" disabled>Выберите сотрудника</option>{initial && !options.assignees.some(row => row.id === initial.assignedMembershipId) && <option value={initial.assignedMembershipId} disabled>{initial.assigneeName} (недоступен для назначения)</option>}{options.assignees.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label>Начало · {options.branch.timezone}<input type="datetime-local" name="startsAt" required defaultValue={initial?.startsAt}/></label>
    <label>Окончание · {options.branch.timezone}<input type="datetime-local" name="endsAt" required defaultValue={initial?.endsAt}/></label>
    <button className="primary">{initial ? "Сохранить смену" : "Назначить смену"}</button>
  </RetainedActionForm>;
}
