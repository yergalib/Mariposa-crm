"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { ChatCard, ChatReply } from "@/lib/assistant/chat/contracts";
import { hasSensitiveText } from "@/lib/assistant/chat/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { Butterfly } from "./Butterfly";
import { PhotoPlaceholder, priceText } from "./ShowroomPresentation";
import type { PublicBranch } from "@/lib/showroom/contracts";
import type { OutfitAction, OutfitContext, OutfitSlot } from "@/lib/assistant/chat/outfit-contracts";
import { emptyOutfit } from "@/lib/assistant/chat/outfit-contracts";
import { InquiryForm } from "./InquiryForm";
type Message = { role: "user" | "assistant"; content: string; cards?: ChatCard[]; slot?: OutfitSlot };
export function ChatSelectionEntry({ availability, branches }: { availability: "off" | "login" | "ready" | "forbidden"; branches: PublicBranch[] }) {
  const dialog = useRef<HTMLDialogElement>(null), sending = useRef(false), transcript = useRef<HTMLElement>(null);
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : "");
  const [messages, setMessages] = useState<Message[]>([]), [draft, setDraft] = useState("");
  const [synthetic, setSynthetic] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [context, setContext] = useState<OutfitContext>();
  const [outfit, setOutfit] = useState<Partial<Record<OutfitSlot, ChatCard>>>({});
  const [choices, setChoices] = useState<NonNullable<ChatReply["choices"]>>([]);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [periodEditing, setPeriodEditing] = useState(true), [from, setFrom] = useState(""), [until, setUntil] = useState("");
  async function send(event?: FormEvent<HTMLFormElement>, action?: OutfitAction, actionText?: string, periodContext?: OutfitContext) {
    event?.preventDefault();
    if (sending.current || availability !== "ready" || !synthetic) return;
    const content = actionText ?? draft.trim();
    if (!content) return;
    if (hasSensitiveText(content)) { setError("Не отправляйте контакты, имена, документы или ссылки. Используйте вымышленный сценарий."); return; }
    const next: Message[] = [...(action?.type === "period" ? [] : messages.slice(-8)), { role: "user", content }];
    const payload = { syntheticOnly: true, ...(branchId ? { branchId } : {}), context: periodContext ?? context, action, messages: next.map(message => ({ role: message.role, content: message.content })) };
    if (next.length > 9 || new TextEncoder().encode(JSON.stringify(payload)).length > 12000) { setError("Лимит тестового диалога исчерпан. Начните новый диалог."); return; }
    sending.current = true; setPending(true); setError("");
    try {
      const response = await fetch("/api/showroom/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { if (response.status === 401) setNeedsLogin(true); throw new Error(data.error || "Помощник временно недоступен."); }
      const answer = data as ChatReply;
      setMessages([...next, { role: "assistant", content: answer.message, cards: answer.cards, slot: answer.context?.activeSlot }]); if (!action) setDraft("");
      if (action?.type === "period") setPeriodEditing(false);
      setContext(answer.context); setOutfit(answer.outfit ?? {}); setChoices(answer.choices ?? []);
      if (action?.type === "finish" && Object.keys(answer.outfit ?? {}).length) setInquiryOpen(true);
      requestAnimationFrame(() => { const pane = transcript.current; if (pane) pane.scrollTop = action?.type === "finish" ? 0 : pane.scrollHeight; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Связь прервалась. Запрос автоматически не повторяется."); }
    finally { sending.current = false; setPending(false); }
  }
  function editPeriod() {
    setPeriodEditing(true); setOutfit({}); setChoices([]); setInquiryOpen(false); setError("");
    setMessages(current => current.map(message => ({ ...message, cards: undefined })));
  }
  function confirmPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !until || until <= from) { setError("Возврат должен быть позже получения. Выберите обе даты и время."); return; }
    const nextContext = { ...(context ?? emptyOutfit()), from, until, calendarPeriod: true };
    void send(undefined, { type: "period" }, "Период выбран в календаре", nextContext);
  }
  const selectedCards = Object.values(outfit).filter((card): card is ChatCard => Boolean(card));
  return <>
    <section className="selection-invitation" aria-label="Помощь с выбором платья"><p className="showroom-eyebrow">Особенный день начинается с образа</p><button className="selection-launch" aria-haspopup="dialog" aria-controls="assistant-dialog" onClick={() => dialog.current?.showModal()}><Butterfly /><span>Подобрать платье</span><span className="selection-launch-hint">Расскажите о своих пожеланиях</span></button><p>Начните с подбора — или посмотрите каталог ниже.</p></section>
    <dialog id="assistant-dialog" className="selection-dialog chat-dialog" ref={dialog} aria-labelledby="assistant-title"><div className="selection-dialog-header"><h2 id="assistant-title">MARIPOSA · Подбор</h2><button autoFocus type="button" onClick={() => dialog.current?.close()}>В каталог ×</button></div>
      {availability === "off" ? <div role="status"><p>Разговорный помощник ещё не подключён. Пока можно выбрать платье в каталоге и оставить заявку сотруднику.</p><button onClick={() => dialog.current?.close()}>Вернуться в каталог</button></div> : availability === "login" || needsLogin ? <div><p>Сейчас помощник тестируется только сотрудниками PILOT.</p><Link href="/login">Войти как сотрудник</Link><p>После входа вернитесь в витрину.</p></div> : availability === "forbidden" ? <p role="status">Для тестирования нужны права сотрудника на просмотр каталога PILOT.</p> : <>
        <div className="chat-context"><label>Филиал<select value={branchId} disabled={pending || inquiryOpen} onChange={event => { editPeriod(); setBranchId(event.target.value); setMessages(current => current.map(message => ({ ...message, cards: undefined }))); setError(""); }}><option value="" disabled>Выберите филиал</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.city} — {branch.name}</option>)}</select></label><label className="chat-synthetic"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} disabled={pending} />PILOT: вымышленный запрос, без личных данных</label></div>
        {!periodEditing && context?.from && context.until && <div className="chat-period-summary"><span>{context.from.replace("T", " ")} — {context.until.replace("T", " ")}<br />{branches.find(branch => branch.id === branchId)?.timezone}</span><button type="button" disabled={pending || inquiryOpen} onClick={editPeriod}>Изменить даты</button></div>}
        <section className="chat-transcript" ref={transcript} role="log" aria-live="polite" aria-label="Диалог">{periodEditing && <form className="chat-period-form" onSubmit={confirmPeriod}><h3>На какие даты нужен наряд?</h3><p>Время филиала: {branches.find(branch => branch.id === branchId)?.timezone ?? "сначала выберите филиал"}.</p><label>Получение<input type="datetime-local" required value={from} onChange={event => setFrom(event.target.value)} disabled={pending} /></label><label>Возврат<input type="datetime-local" required min={from || undefined} value={until} onChange={event => setUntil(event.target.value)} disabled={pending} /></label><p>Затем подберём платье, размер и дополнения. При смене периода проверим выбранные вещи заново.</p>{error && <p role="alert">{error}</p>}<button className="primary" disabled={pending || !synthetic || !branchId}>{pending ? "Проверяем период…" : "Продолжить"}</button></form>}<div hidden={inquiryOpen || periodEditing}>{!messages.length && <p>Какое платье ищете? Напишите цвет, размер и даты. Уже указанные данные повторять не нужно.</p>}
          {messages.map((message, index) => <article key={index} className={`chat-message chat-${message.role}`}><strong>{message.role === "user" ? "Вы" : "MARIPOSA"}</strong><p>{message.content}</p>{message.cards && message.cards.length > 0 && <div className="selection-results">{message.cards.map(card => <article className="showroom-product" key={card.item.id}><PhotoPlaceholder /><div className="showroom-product-info"><h3>{card.item.name}</h3><p>{card.item.execution} · Размер {card.item.size}</p><p>{priceText(card.item.price)}</p><p>{card.from.replace("T", " ")} — {card.until.replace("T", " ")}</p><p>{card.item.available ? "Доступно на выбранные даты · требует подтверждения" : "На выбранные даты недоступно"}</p><button type="button" disabled={pending} onClick={() => void send(undefined, { type: "select", slot: message.slot ?? "dress", variantId: card.item.id }, `Выбираю: ${card.item.name}, размер ${card.item.size}`)}>Выбрать в комплект</button><Link href={browseHref({ search: "", categoryId: "", page: 1 }, card)}>Подробнее о товаре</Link></div></article>)}</div>}</article>)}
        </div>{inquiryOpen && selectedCards[0] && context?.from && context.until && <InquiryForm item={selectedCards[0].item} additionalItems={selectedCards.slice(1).map(card => card.item)} filters={{ branchId, from: context.from, until: context.until, size: selectedCards[0].item.size, search: "" }} branchLabel={branches.find(branch => branch.id === branchId)?.name ?? ""} onNewSearch={() => setInquiryOpen(false)} />}</section>
        <div className="chat-bottom" hidden={inquiryOpen || periodEditing}>{selectedCards.length > 0 && <div className="outfit-summary" aria-label="Ваш выбор"><details><summary>Выбрано вещей: {selectedCards.length}</summary>{(Object.entries(outfit) as [OutfitSlot, ChatCard][]).map(([slot, card]) => <div key={slot}><span>{card.item.name} · {card.item.size}</span><button type="button" disabled={pending} onClick={() => void send(undefined, { type: "remove", slot }, `Убрать ${slot === "dress" ? "платье" : slot === "shoes" ? "обувь" : "аксессуар"}`)}>Убрать</button></div>)}</details><button type="button" disabled={pending} onClick={() => void send(undefined, { type: "finish" }, "Перейти к заявке на выбранное")}>Оставить заявку на выбранное</button></div>}<div className="chat-choices">{choices.map(choice => <button type="button" key={choice.categoryId ?? choice.slot} disabled={pending} onClick={() => void send(undefined, { type: "search", slot: choice.slot, categoryId: choice.categoryId }, choice.label)}>{choice.label}</button>)}</div>{pending && <p role="status">Проверяем запрос…</p>}{error && <p role="alert">{error}</p>}<form onSubmit={send} className="chat-compose"><label>Сообщение<textarea name="message" required maxLength={700} rows={2} value={draft} onChange={event => setDraft(event.target.value)} disabled={pending} placeholder="Жёлтое платье, размер 140…" /></label><button className="primary" disabled={!synthetic || !branchId || pending || !draft.trim()}>{pending ? "Ждём…" : "Отправить"}</button></form><div className="chat-footer"><button type="button" disabled={pending} onClick={() => { setMessages([]); setError(""); setDraft(""); setContext(undefined); setOutfit({}); setChoices([]); setFrom(""); setUntil(""); setPeriodEditing(true); }}>Новый диалог</button><span>Бронь подтверждает сотрудник. Ввод сохраняется до обновления страницы.</span></div></div>
      </>}
    </dialog>
  </>;
}
