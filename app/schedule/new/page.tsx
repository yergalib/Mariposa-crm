import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ShiftForm } from "@/components/ShiftForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { shiftOptions } from "@/lib/staff/shifts";
export default async function Page({ searchParams }: { searchParams: Promise<{ branchId?: string }> }) {
  const actor = await requireRouteAccess("/schedule"), query = await searchParams;
  let options: Awaited<ReturnType<typeof shiftOptions>>;
  try { options = await shiftOptions(actor, query.branchId); }
  catch { return <AppShell active="/schedule" title="Новая смена"><p>Филиал недоступен.</p><Link href="/schedule">К графику</Link></AppShell>; }
  return <AppShell active="/schedule" title="Новая смена"><Link href="/schedule">К графику</Link>{options.canManage ? <><form className="toolbar"><label>Филиал<select name="branchId" defaultValue={options.branch?.id}>{options.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="secondary">Выбрать филиал</button></form><p>{options.branch?.name} · {options.branch?.timezone}</p><ShiftForm options={options} creationKey={randomUUID()}/></> : <p>График назначает владелец или директор.</p>}</AppShell>;
}
