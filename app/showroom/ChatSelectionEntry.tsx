"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { ChatCard, ChatReply } from "@/lib/assistant/chat/contracts";
import { hasSensitiveText } from "@/lib/assistant/chat/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { Butterfly } from "./Butterfly";
import { PhotoPlaceholder, priceText } from "./ShowroomPresentation";
type Message = { role: "user" | "assistant"; content: string; cards?: ChatCard[] };
export function ChatSelectionEntry({ availability }: { availability: "off" | "login" | "ready" | "forbidden" }) {
  const dialog = useRef<HTMLDialogElement>(null), sending = useRef(false), replyHeading = useRef<HTMLHeadingElement>(null);
  const [messages, setMessages] = useState<Message[]>([]), [draft, setDraft] = useState("");
  const [synthetic, setSynthetic] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || availability !== "ready" || !synthetic) return;
    const content = draft.trim();
    if (!content) return;
    if (hasSensitiveText(content)) { setError("Не отправляйте контакты, имена, документы или ссылки. Используйте вымышленный сценарий."); return; }
    const next: Message[] = [...messages, { role: "user", content }];
    const payload = { syntheticOnly: true, messages: next.map(message => ({ role: message.role, content: message.content })) };
    if (next.length > 9 || new TextEncoder().encode(JSON.stringify(payload)).length > 12000) { setError("Лимит тестового диалога исчерпан. Начните новый диалог."); return; }
    sending.current = true; setPending(true); setError("");
    try {
      const response = await fetch("/api/showroom/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { if (response.status === 401) setNeedsLogin(true); throw new Error(data.error || "Помощник временно недоступен."); }
      const answer = data as ChatReply;
      setMessages([...next, { role: "assistant", content: answer.message, cards: answer.cards }]); setDraft("");
      requestAnimationFrame(() => replyHeading.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Связь прервалась. Запрос автоматически не повторяется."); }
    finally { sending.current = false; setPending(false); }
  }
  return <>
    <section className="selection-invitation" aria-label="Помощь с выбором платья"><p className="showroom-eyebrow">Особенный день начинается с образа</p><button className="selection-launch" aria-haspopup="dialog" aria-controls="assistant-dialog" onClick={() => dialog.current?.showModal()}><Butterfly /><span>Подобрать платье</span><span className="selection-launch-hint">Расскажите о своих пожеланиях</span></button><p>Начните с подбора — или посмотрите каталог ниже.</p></section>
    <dialog id="assistant-dialog" className="selection-dialog" ref={dialog} aria-labelledby="assistant-title"><div className="selection-dialog-header"><span>MARIPOSA · Консультант</span><button autoFocus type="button" onClick={() => dialog.current?.close()}>Закрыть ×</button></div>
      <h2 id="assistant-title">Расскажите, для кого и на какой праздник ищете образ</h2>
      {availability === "off" ? <div role="status"><p>Разговорный помощник ещё не подключён. Пока можно выбрать платье в каталоге и оставить заявку сотруднику.</p><button onClick={() => dialog.current?.close()}>Вернуться в каталог</button></div> : availability === "login" || needsLogin ? <div><p>Сейчас помощник тестируется только сотрудниками PILOT.</p><Link href="/login">Войти как сотрудник</Link><p>После входа вернитесь в витрину.</p></div> : availability === "forbidden" ? <p role="status">Для тестирования нужны права сотрудника на просмотр каталога PILOT.</p> : <>
        <p className="selection-disclosure">Тестовый AI-консультант. Используйте только вымышленные запросы без персональных данных клиентов и детей. Контакты указываются отдельно в заявке, а не в диалоге. Цена и наличие требуют подтверждения сотрудником.</p>
        <label className="chat-synthetic"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} disabled={pending} />Я тестирую вымышленный сценарий, без реальных персональных данных</label>
        <section className="chat-transcript" aria-label="Диалог"><h3 ref={replyHeading} tabIndex={-1}>Диалог с консультантом</h3>{!messages.length && <p>Напишите, какой образ ищете. Консультант уточнит недостающее; возраст не заменяет точный размер.</p>}
          {messages.map((message, index) => <article key={index} className={`chat-message chat-${message.role}`}><strong>{message.role === "user" ? "Вы" : "MARIPOSA"}</strong><p>{message.content}</p>{message.cards && message.cards.length > 0 && <div className="selection-results">{message.cards.map(card => <article className="showroom-product" key={card.item.id}><PhotoPlaceholder /><div className="showroom-product-info"><h3>{card.item.name}</h3><p>{card.item.execution} · Размер {card.item.size}</p><p>{priceText(card.item.price)}</p><p>{card.from.replace("T", " ")} — {card.until.replace("T", " ")}</p><p>{card.item.available ? "Доступно на выбранные даты · требует подтверждения" : "На выбранные даты недоступно"}</p><Link href={browseHref({ search: "", categoryId: "", page: 1 }, card)}>Открыть товар и заявку</Link></div></article>)}</div>}</article>)}
        </section>
        <form onSubmit={send} className="chat-compose"><label>Ваше сообщение<textarea name="message" required maxLength={700} rows={3} value={draft} onChange={event => setDraft(event.target.value)} disabled={pending} placeholder="Вымышленный тест: ищу жёлтое платье, размер 104" /></label><button className="primary" disabled={!synthetic || pending || !draft.trim()}>{pending ? "Консультант отвечает…" : "Отправить"}</button></form>
        {pending && <p role="status">Проверяем запрос. Автоматических повторов нет.</p>}{error && <p role="alert">{error}</p>}
        <button type="button" disabled={pending} onClick={() => { setMessages([]); setError(""); setDraft(""); }}>Новый тестовый диалог</button><p className="selection-retention">Закрытие окна сохраняет ввод до обновления или перехода на другую страницу. Новый диалог не сбрасывает серверные ограничения запросов.</p>
      </>}
    </dialog>
  </>;
}
