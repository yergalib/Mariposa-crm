"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SelectionHandoff } from "@/lib/assistant/selection";
import type { PublicVariant } from "@/lib/showroom/contracts";
import { PUBLIC_INQUIRY_INTAKE_OPEN } from "@/lib/showroom/release";
import { InquiryDraft } from "./InquiryDraft";
export function InquiryForm({ item, filters, branchLabel, onNewSearch, requestText, additionalItems = [], purpose = "booking" }: SelectionHandoff & { additionalItems?: PublicVariant[]; purpose?: "booking" | "fitting"; branchLabel: string; requestText?: string; onNewSearch: () => void }) {
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => { detailRef.current?.focus(); }, []);
  const [contact, setContact] = useState(""), [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false), [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false), [error, setError] = useState("");
  const sending = useRef(false), payload = useRef<object | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!PUBLIC_INQUIRY_INTAKE_OPEN || sending.current || done) return;
    const native = new FormData(event.currentTarget);
    sending.current = true; setPending(true); setError(""); setLocked(true);
    payload.current ??= { purpose, ...(purpose === "fitting" ? { preferredVisit: String(native.get("preferredVisit") ?? "") } : {}), branchId: filters.branchId, from: filters.from, until: filters.until,
      variantId: item.id, ...(additionalItems.length ? { additionalVariantIds: additionalItems.map(candidate => candidate.id) } : {}), ...(requestText ? { requestText } : {}), replyContact: String(native.get("replyContact") ?? ""), website: String(native.get("website") ?? ""), creationKey: crypto.randomUUID() };
    try {
      const response = await fetch("/api/showroom/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload.current) });
      const data = await response.json();
      if (!response.ok) {
        // Validation failures do not save. On uncertain delivery retain the exact payload/key.
        if ([400, 413, 415].includes(response.status)) { payload.current = null; setLocked(false); }
        throw new Error(data.error || "Не удалось отправить заявку.");
      }
      if (data?.ok !== true) throw new Error("Подтверждение создания заявки не получено. Повторите отправку этой же заявки.");
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Связь прервалась. Повторите отправку этой же заявки."); }
    finally { sending.current = false; setPending(false); }
  }
  if (!PUBLIC_INQUIRY_INTAKE_OPEN) return <><InquiryDraft requestText={requestText} purpose={purpose} productName={item.name} execution={item.execution} size={item.size} period={filters} branchLabel={branchLabel} additionalItems={additionalItems.map(({ name, execution, size }) => ({ name, execution, size }))} /><button type="button" onClick={onNewSearch}>Вернуться к выбору</button></>;
  if (done) return <div><p role="status">{purpose === "fitting" ? "Запрос на примерку принят. Время согласует сотрудник; запись пока не подтверждена." : "Заявка на бронь принята. Ожидает подтверждения сотрудником. Товар пока не зарезервирован."}</p><button onClick={onNewSearch}>Вернуться к выбору</button></div>;
  return <section ref={detailRef} tabIndex={-1} className="showroom-inquiry" aria-label="Выбранное платье и заявка"><form onSubmit={submit} className="showroom-contact">
    <h2>{purpose === "fitting" ? "Запрос на примерку" : "Заявка на бронь"}: {item.name}{item.execution && ` · ${item.execution}`}, {item.size}</h2>
    {additionalItems.map(candidate => <p key={candidate.id}>{candidate.name}{candidate.execution && ` · ${candidate.execution}`} · {candidate.size}</p>)}
    <p className="showroom-summary">Филиал: {branchLabel} · Размер: {item.size}</p>
    <p>{filters.from.replace("T", " ")} — {filters.until.replace("T", " ")}, по времени выбранного филиала.</p>
    {requestText && <div className="selection-brief"><h3>Пожелания сотруднику</h3><p>{requestText}</p></div>}
    <label>Телефон или email<input name="replyContact" required maxLength={254} value={contact} onChange={e => setContact(e.target.value)} readOnly={locked} autoComplete="off" /></label>
    {purpose === "fitting" && <label>Пожелание к визиту, необязательно<input name="preferredVisit" type="datetime-local" readOnly={locked} /><span>Время выбранного филиала. Это не свободный слот; сотрудник согласует визит отдельно.</span></label>}
    <label className="showroom-trap" aria-hidden="true">Ваш сайт<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
    <p>Контакт нужен сотруднику MARIPOSA только для ответа по этой заявке. Не указывайте документы, платёжные данные или другие личные сведения.</p>
    <p>Цена и наличие требуют подтверждения сотрудником. Оплата и автоматическая бронь здесь не выполняются.</p>
    {error && <p role="alert">{error}{locked ? " Повторная отправка использует ту же заявку; данные зафиксированы до получения ответа." : ""}</p>}
    <button className="primary" disabled={pending}>{pending ? "Отправляем…" : purpose === "fitting" ? "Отправить запрос на примерку" : "Оставить заявку на бронь"}</button>
    {!locked && <button type="button" onClick={onNewSearch}>Изменить выбор</button>}
  </form></section>;
}
