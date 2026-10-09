"use client";
import { useRef, useState } from "react";
import { DayPicker, type DateRange } from "@daypicker/react";
import { ru } from "@daypicker/react/locale";
import "@daypicker/react/style.css";
// Calendar dates are civil branch-local values, not browser-timezone instants.
function calendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : undefined;
}
function dateText(value?: Date) { return value ? value.toISOString().slice(0, 10) : ""; }
export function RentalDateRange({ from = "", until = "", onChange, required = false }: { from?: string; until?: string; onChange?: (from: string, until: string) => void; required?: boolean }) {
  const [local, setLocal] = useState({ from, until });
  const current = onChange ? { from, until } : local;
  const update = (nextFrom: string, nextUntil: string) => { if (onChange) onChange(nextFrom, nextUntil); else setLocal({ from: nextFrom, until: nextUntil }); };
  const [draft, setDraft] = useState<DateRange | undefined>();
  const [month, setMonth] = useState<Date>();
  const [times, setTimes] = useState({ from: "12:00", until: "12:00" });
  const details = useRef<HTMLDetailsElement>(null);
  function close() { if (details.current) { details.current.open = false; details.current.querySelector("summary")?.focus(); } }
  return <div className="rental-date-range">
    <div className="rental-date-inputs"><label>Получение<input name="from" type="datetime-local" required={required} value={current.from} onChange={e => update(e.target.value, current.until)} /></label><label>Возврат<input name="until" type="datetime-local" required={required} value={current.until} min={current.from || undefined} onChange={e => update(current.from, e.target.value)} /></label></div>
    <details ref={details} onChange={e => e.stopPropagation()} onToggle={e => { if (e.currentTarget.open) { const start = calendarDate(current.from); setDraft(start ? { from: start, to: calendarDate(current.until) } : undefined); setMonth(start); setTimes({ from: current.from.slice(11,16) || "12:00", until: current.until.slice(11,16) || "12:00" }); } }} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); close(); } }}>
      <summary>Выбрать период в календаре</summary>
      <div className="rental-calendar"><DayPicker mode="range" locale={ru} timeZone="UTC" selected={draft} onSelect={setDraft} month={month} onMonthChange={setMonth} defaultMonth={calendarDate(current.from)} navLayout="after" />
      <p>Выберите получение и возврат. Время — местное для филиала, не расписание свободных слотов.</p>
      <div className="rental-date-inputs"><label>Время получения<input type="time" value={times.from} onChange={e => setTimes(old => ({ ...old, from: e.target.value }))} /></label><label>Время возврата<input type="time" value={times.until} onChange={e => setTimes(old => ({ ...old, until: e.target.value }))} /></label></div>
      <p role="status">{draft?.from ? dateText(draft.from) + (draft.to ? " — " + dateText(draft.to) : " — выберите возврат") : "Период не выбран"}</p>
      <div className="rental-calendar-actions"><button type="button" disabled={!draft?.from || !times.from || (Boolean(draft?.to) && !times.until)} onClick={() => { update(dateText(draft?.from) + "T" + times.from, draft?.to ? dateText(draft.to) + "T" + times.until : ""); close(); }}>Применить даты</button><button type="button" onClick={close}>Отмена</button><button type="button" onClick={() => { update("", ""); close(); }}>Очистить даты</button></div></div>
    </details>
  </div>;
}
