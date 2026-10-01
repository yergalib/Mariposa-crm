"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SelectionHandoff } from "@/lib/assistant/selection";
export function InquiryForm({ item, filters, branchLabel, onNewSearch }: SelectionHandoff & { branchLabel: string; onNewSearch: () => void }) {
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => { detailRef.current?.focus(); }, []);
  const [contact, setContact] = useState(""), [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false), [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false), [error, setError] = useState("");
  const sending = useRef(false), payload = useRef<object | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || done) return;
    const native = new FormData(event.currentTarget);
    sending.current = true; setPending(true); setError(""); setLocked(true);
    payload.current ??= { branchId: filters.branchId, from: filters.from, until: filters.until,
      variantId: item.id, replyContact: String(native.get("replyContact") ?? ""), website: String(native.get("website") ?? ""), creationKey: crypto.randomUUID() };
    try {
      const response = await fetch("/api/showroom/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload.current) });
      const data = await response.json();
      if (!response.ok) {
        // Validation failures do not save. On uncertain delivery retain the exact payload/key.
        if ([400, 413, 415].includes(response.status)) { payload.current = null; setLocked(false); }
        throw new Error(data.error || "Не удалось отправить заявку.");
      }
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Связь прервалась. Повторите отправку этой же заявки."); }
    finally { sending.current = false; setPending(false); }
  }
  if (done) return <div><p role="status">Заявка на бронь принята. Ожидает подтверждения сотрудником. Товар пока не зарезервирован.</p><button onClick={onNewSearch}>Вернуться к выбору</button></div>;
  return <section ref={detailRef} tabIndex={-1} className="showroom-inquiry" aria-label="Выбранное платье и заявка"><form onSubmit={submit} className="showroom-contact">
    <h2>Заявка на бронь: {item.name}, {item.size}</h2>
    <p className="showroom-summary">Филиал: {branchLabel} · Размер: {item.size}</p>
    <p>{filters.from.replace("T", " ")} — {filters.until.replace("T", " ")}, по времени выбранного филиала.</p>
    <label>Телефон или email<input name="replyContact" required maxLength={254} value={contact} onChange={e => setContact(e.target.value)} readOnly={locked} autoComplete="off" /></label>
    <label className="showroom-trap" aria-hidden="true">Ваш сайт<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
    <p>Контакт нужен сотруднику MARIPOSA только для ответа по этой заявке. Не указывайте документы, платёжные данные или другие личные сведения.</p>
    <p>Цена и наличие требуют подтверждения сотрудником. Оплата и автоматическая бронь здесь не выполняются.</p>
    {error && <p role="alert">{error}{locked ? " Повторная отправка использует ту же заявку; данные зафиксированы до получения ответа." : ""}</p>}
    <button className="primary" disabled={pending}>{pending ? "Отправляем…" : "Оставить заявку на бронь"}</button>
    {!locked && <button type="button" onClick={onNewSearch}>Изменить выбор</button>}
  </form></section>;
}
