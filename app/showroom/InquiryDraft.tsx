"use client";
import { ShowroomContactLink } from "./ShowroomContactLink";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useTabState } from "./TabState";
import { fittingState } from "@/lib/showroom/tab-state";
export function InquiryDraft({ autoFocus = false, purpose = "fitting", productName, execution, size, period, branchLabel, additionalItems = [], requestText }: { autoFocus?: boolean; requestText?: string; purpose?: "booking" | "fitting"; productName?: string; execution?: string | null; size?: string; period?: { from: string; until: string }; branchLabel?: string; additionalItems?: { name: string; execution?: string | null; size: string }[] }) {
  const pendingId = useId(), section = useRef<HTMLElement>(null);
  useEffect(() => { if (autoFocus) section.current?.focus(); }, [autoFocus]);
  const [preferences, setPreferences] = useTabState("fitting", fittingState, { day: "", time: "" });
  const { day: preferredDay, time: preferredTime } = preferences;
  const setPreferredDay = (day: string) => setPreferences(old => ({ ...old, day }));
  const setPreferredTime = (time: string) => setPreferences(old => ({ ...old, time }));
  const [review, setReview] = useState(false);
  return <section ref={section} tabIndex={-1} className="inquiry-draft" aria-label={purpose === "fitting" ? "Пожелания к примерке" : "Заявка на бронь"}>
    <h2>{purpose === "fitting" ? "Запрос на примерку" : "Заявка на бронь"}</h2>
    {productName && <p>{productName}{execution && ` · ${execution}`}{size && ` · Размер ${size}`}</p>}
    {additionalItems.map((item, index) => <p key={index}>{item.name}{item.execution && ` · ${item.execution}`} · Размер {item.size}</p>)}
    {requestText && <div className="selection-brief"><h3>Пожелания сотруднику</h3><p style={{ whiteSpace: "pre-line" }}>{requestText}</p></div>}
    {branchLabel && <p>Филиал: {branchLabel}</p>}
    {purpose === "booking" && period && <p>Планируемая аренда: {period.from.replace("T", " ")} — {period.until.replace("T", " ")}. Это не время примерки.</p>}
    <p>Онлайн-отправка заявок пока не открыта. Контактные данные здесь не собираются. {purpose === "fitting" ? "Для визита не нужны период аренды и проверка наличия. " : ""}Обсудите пожелания напрямую с шоурумом.</p>
    {purpose === "fitting" && <><p>Выберите пожелания к визиту. Это не расписание свободных мест: время согласует сотрудник.</p><div className="fitting-preferences">
      <label>Предпочтительный день, необязательно<input type="date" value={preferredDay} onChange={event => { setPreferredDay(event.target.value); setReview(false); }} /></label>
      <label>Удобное время, необязательно<input type="time" value={preferredTime} onChange={event => { setPreferredTime(event.target.value); setReview(false); }} /></label>
    </div><button type="button" onClick={() => setReview(true)}>Посмотреть пожелания</button>
    {review && <p role="status">Пожелания: {preferredDay || "день обсудить"}, {preferredTime || "время обсудить"}. Не отправлены; запись не подтверждена.</p>}</>}
    <div className="site-actions"><button type="button" disabled aria-describedby={pendingId}>Отправка пока недоступна</button><ShowroomContactLink /><Link href="/showroom?view=contacts">Контакты и адрес</Link></div>
    <p id={pendingId} className="site-muted">Черновик сохраняется в этой вкладке до 30 минут, не отправляется и не сохраняется в CRM.</p>
  </section>;
}
