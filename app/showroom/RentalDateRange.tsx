"use client";
import { useId, useRef, useState } from "react";
import { DayPicker, type DateRange } from "@daypicker/react";
import { ru } from "@daypicker/react/locale";
import "@daypicker/react/style.css";
import "./rental-period.css";

// Calendar dates are civil branch-local values, never browser-timezone instants.
function calendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : undefined;
}
function dateText(value?: Date) { return value ? value.toISOString().slice(0, 10) : ""; }
function dateLabel(value: string) { return value ? value.slice(8, 10) + "." + value.slice(5, 7) + "." + value.slice(0, 4) : "Дата не выбрана"; }
function summary(value: string) { return value ? dateLabel(value) + ", " + value.slice(11, 16) : "Не выбрано"; }

export function RentalDateRange({ from = "", until = "", onChange, required = false }: { from?: string; until?: string; onChange?: (from: string, until: string) => void; required?: boolean }) {
  const [local, setLocal] = useState({ from, until });
  const current = onChange ? { from, until } : local;
  const update = (nextFrom: string, nextUntil: string) => { if (onChange) onChange(nextFrom, nextUntil); else setLocal({ from: nextFrom, until: nextUntil }); };
  const [draft, setDraft] = useState<DateRange | undefined>();
  const [month, setMonth] = useState<Date>();
  const [times, setTimes] = useState({ from: "", until: "" });
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
  function begin() {
    const start = calendarDate(current.from);
    setDraft(start ? { from: start, to: calendarDate(current.until) } : undefined);
    setMonth(start);
    setTimes({ from: current.from.slice(11, 16), until: current.until.slice(11, 16) });
    setOpen(true); dialog.current?.showModal();
  }
  const ready = Boolean(draft?.from && times.from && (!draft.to || times.until));
  return <div className="rental-date-range">
    <input type="hidden" name="from" value={current.from} /><input type="hidden" name="until" value={current.until} />
    <button ref={trigger} type="button" className="rental-period-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} aria-label={"Получение — Возврат" + (required ? " (обязательно)" : "") + ": " + (current.from || current.until ? summary(current.from) + " — " + summary(current.until) : "Выбрать даты и время")} onClick={begin}>
      <span><span className="rental-period-label">Получение — Возврат</span><span className="rental-period-value">{current.from || current.until ? <>{summary(current.from)}<span aria-hidden="true"> — </span>{summary(current.until)}</> : "Выбрать даты и время"}</span></span>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M7 2v6M17 2v6M3 11h18" /></svg>
    </button>
    <dialog ref={dialog} id={id} className="rental-picker-dialog" aria-labelledby={id + "-title"} aria-describedby={id + "-hint"} onChange={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }} onCancel={event => { event.preventDefault(); close(); }} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <header className="rental-picker-header"><h2 id={id + "-title"}>Период аренды</h2><button type="button" aria-label="Закрыть календарь" onClick={close}>×</button></header>
      <div className="rental-calendar">
        <DayPicker mode="range" locale={ru} timeZone="UTC" selected={draft} onSelect={(range, day) => setDraft(!draft?.from || draft.to ? { from: day, to: undefined } : range)} month={month} onMonthChange={setMonth} defaultMonth={calendarDate(current.from)} navLayout="after" fixedWeeks />
      </div>
      <div className="rental-picker-times">
        <label>Получение<output>{dateLabel(dateText(draft?.from))}</output><input type="time" aria-label="Время получения" value={times.from} onChange={event => setTimes(value => ({ ...value, from: event.target.value }))} /></label>
        <label>Возврат<output>{dateLabel(dateText(draft?.to))}</output><input type="time" aria-label="Время возврата" value={times.until} onChange={event => setTimes(value => ({ ...value, until: event.target.value }))} /></label>
      </div>
      <p id={id + "-hint"}>Выберите даты и укажите время. Время — местное для филиала; календарь не показывает наличие.</p>
      <div className="rental-calendar-actions">
        <button type="button" className="primary" disabled={!ready} onClick={() => { update(dateText(draft?.from) + "T" + times.from, draft?.to ? dateText(draft.to) + "T" + times.until : ""); close(); }}>Применить даты</button>
        <button type="button" onClick={close}>Отмена</button><button type="button" onClick={() => { update("", ""); close(); }}>Очистить даты</button>
      </div>
    </dialog>
  </div>;
}
