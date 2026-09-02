import { z } from "zod";
import type { CalendarView } from "@/lib/calendar/timezone";
export const CALENDAR_STATUSES = ["DRAFT", "RESERVED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;
export type CalendarStatus = typeof CALENDAR_STATUSES[number];
export type CalendarQuery = { view: CalendarView; date?: string; branchId?: string; statuses: CalendarStatus[]; search?: string };
const uuid = z.string().uuid();
export function parseCalendarQuery(raw: { view?: unknown; date?: unknown; branchId?: unknown; status?: unknown; q?: unknown }): CalendarQuery {
  const view = raw.view === "day" || raw.view === "month" ? raw.view : "week";
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : undefined;
  const branchId = typeof raw.branchId === "string" && raw.branchId ? uuid.safeParse(raw.branchId).data : undefined;
  const values = Array.isArray(raw.status) ? raw.status : typeof raw.status === "string" ? raw.status.split(",") : [];
  const statuses = values.filter((v): v is CalendarStatus => CALENDAR_STATUSES.includes(v as CalendarStatus));
  return { view, date, branchId, statuses: statuses.length ? [...new Set(statuses)] : ["RESERVED", "CONFIRMED", "COMPLETED"], search: typeof raw.q === "string" ? raw.q.trim().slice(0, 100) || undefined : undefined };
}
