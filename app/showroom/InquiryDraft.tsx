"use client";
import { useState } from "react";
import Link from "next/link";
export function InquiryDraft({ purpose = "fitting", productName, size, period }: { purpose?: "booking" | "fitting"; productName?: string; size?: string; period?: { from: string; until: string } }) {
  const [preferredDay, setPreferredDay] = useState(""), [preferredTime, setPreferredTime] = useState("");
  const [review, setReview] = useState(false);
  return <section className="inquiry-draft" aria-label={purpose === "fitting" ? "Пожелания к примерке" : "Заявка на бронь"}>
    <h2>{purpose === "fitting" ? "Запрос на примерку" : "Заявка на бронь"}</h2>
    {productName && <p>{productName}{size && ` · Размер ${size}`}</p>}
    {period && <p>Планируемая аренда: {period.from.replace("T", " ")} — {period.until.replace("T", " ")}. Это не время примерки.</p>}
    <p>Онлайн-отправка заявок пока не открыта. Контактные данные здесь не собираются. Можно обсудить примерку с сотрудником через раздел контактов.</p>
    {purpose === "fitting" && <><p>Выберите пожелания к визиту. Это не расписание свободных мест: время согласует сотрудник.</p><div className="fitting-preferences">
      <label>Предпочтительный день, необязательно<input type="date" value={preferredDay} onChange={event => { setPreferredDay(event.target.value); setReview(false); }} /></label>
      <label>Удобное время, необязательно<input type="time" value={preferredTime} onChange={event => { setPreferredTime(event.target.value); setReview(false); }} /></label>
    </div><button type="button" onClick={() => setReview(true)}>Посмотреть пожелания</button>
    {review && <p role="status">Пожелания: {preferredDay || "день обсудить"}, {preferredTime || "время обсудить"}. Не отправлены; запись не подтверждена.</p>}</>}
    <div className="site-actions"><button type="button" disabled aria-describedby="intake-pending">Отправка пока недоступна</button><Link className="site-button" href="/showroom?view=contacts">Связаться с шоурумом</Link></div>
    <p id="intake-pending" className="site-muted">Черновик остаётся только на этой странице и не сохраняется в CRM.</p>
  </section>;
}
