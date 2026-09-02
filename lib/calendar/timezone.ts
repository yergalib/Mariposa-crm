export type LocalDate = { year: number; month: number; day: number };
export type CalendarView = "day" | "week" | "month";

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatterCache.set(timeZone, value);
  }
  return value;
}
export function localParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}
export function localDateKey(date: Date, timeZone: string) { const p = localParts(date, timeZone); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; }
export function parseDateKey(value?: string | null): LocalDate | null { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const [year, month, day] = value.split("-").map(Number), d = new Date(Date.UTC(year, month - 1, day)); return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? { year, month, day } : null; }
export function dateKey(d: LocalDate) { return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`; }
export function addLocalDays(d: LocalDate, amount: number): LocalDate { const x = new Date(Date.UTC(d.year, d.month - 1, d.day + amount)); return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() }; }
export function startOfLocalWeek(d: LocalDate) { const weekday = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay(); return addLocalDays(d, -(weekday === 0 ? 6 : weekday - 1)); }
export function zonedDateTimeToUtc(d: LocalDate, timeZone: string, hour = 0, minute = 0) { let guess = Date.UTC(d.year, d.month - 1, d.day, hour, minute); for (let i = 0; i < 4; i++) { const p = localParts(new Date(guess), timeZone), represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second), target = Date.UTC(d.year, d.month - 1, d.day, hour, minute); const next = guess + target - represented; if (next === guess) break; guess = next; } return new Date(guess); }
export function periodFor(view: CalendarView, anchor: LocalDate, timeZone: string) { let start = anchor, end: LocalDate; if (view === "week") start = startOfLocalWeek(anchor); else if (view === "month") start = { year: anchor.year, month: anchor.month, day: 1 }; if (view === "day") end = addLocalDays(start, 1); else if (view === "week") end = addLocalDays(start, 7); else end = anchor.month === 12 ? { year: anchor.year + 1, month: 1, day: 1 } : { year: anchor.year, month: anchor.month + 1, day: 1 }; return { start, end, rangeStart: zonedDateTimeToUtc(start, timeZone), rangeEnd: zonedDateTimeToUtc(end, timeZone) }; }
export function moveAnchor(view: CalendarView, anchor: LocalDate, direction: -1 | 1) { if (view === "day") return addLocalDays(anchor, direction); if (view === "week") return addLocalDays(anchor, direction * 7); const d = new Date(Date.UTC(anchor.year, anchor.month - 1 + direction, 1)); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: 1 }; }
export function daysInRange(start: LocalDate, end: LocalDate) { const out: LocalDate[] = []; for (let d = start; dateKey(d) < dateKey(end); d = addLocalDays(d, 1)) out.push(d); return out; }
export function formatLocalTime(date: Date, timeZone: string) { return new Intl.DateTimeFormat("ru-KZ", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date); }
