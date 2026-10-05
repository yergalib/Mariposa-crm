"use client";
import { useState } from "react";
import Link from "next/link";
import { useTabState } from "./TabState";
import { fittingState } from "@/lib/showroom/tab-state";
export function InquiryDraft({ purpose = "fitting", productName, size, period, branchLabel, additionalItems = [] }: { purpose?: "booking" | "fitting"; productName?: string; size?: string; period?: { from: string; until: string }; branchLabel?: string; additionalItems?: { name: string; size: string }[] }) {
  const [preferences, setPreferences] = useTabState("fitting", fittingState, { day: "", time: "" });
  const { day: preferredDay, time: preferredTime } = preferences;
  const setPreferredDay = (day: string) => setPreferences(old => ({ ...old, day }));
  const setPreferredTime = (time: string) => setPreferences(old => ({ ...old, time }));
  const [review, setReview] = useState(false);
  return <section className="inquiry-draft" aria-label={purpose === "fitting" ? "Пожелания к примерке" : "Заявка на бронь"}>
    <h2>{purpose === "fitting" ? "Запрос на примерку" : "Заявка на бронь"}</h2>
    {productName && <p>{productName}{size && ` · Размер ${size}`}</p>}
    {additionalItems.map((item, index) => <p key={index}>{item.name} · Размер {item.size}</p>)}
    {branchLabel && <p>Филиал: {branchLabel}</p>}
    {period && <p>Планируемая аренда: {period.from.replace("T", " ")} — {period.until.replace("T", " ")}. Это не время примерки.</p>}
    <p>Онлайн-отправка заявок пока не открыта. Контактные данные здесь не собираются. Можно обсудить примерку с сотрудником через раздел контактов.</p>
    {purpose === "fitting" && <><p>Выберите пожелания к визиту. Это не расписание свободных мест: время согласует сотрудник.</p><div className="fitting-preferences">
      <label>Предпочтительный день, необязательно<input type="date" value={preferredDay} onChange={event => { setPreferredDay(event.target.value); setReview(false); }} /></label>
      <label>Удобное время, необязательно<input type="time" value={preferredTime} onChange={event => { setPreferredTime(event.target.value); setReview(false); }} /></label>
    </div><button type="button" onClick={() => setReview(true)}>Посмотреть пожелания</button>
    {review && <p role="status">Пожелания: {preferredDay || "день обсудить"}, {preferredTime || "время обсудить"}. Не отправлены; запись не подтверждена.</p>}</>}
    <div className="site-actions"><button type="button" disabled aria-describedby="intake-pending">Отправка пока недоступна</button><Link className="site-button" href="/showroom?view=contacts">Связаться с шоурумом</Link></div>
    <p id="intake-pending" className="site-muted">Черновик сохраняется в этой вкладке до 30 минут, не отправляется и не сохраняется в CRM.</p>
  </section>;
}
