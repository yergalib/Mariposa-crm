"use client";
import { rentalPeriodLabel, RENTAL_CONDITIONS } from "@/lib/showroom/period";
import { AssistantFactPanels } from "./AssistantFactPanels";
import { HistoryControls } from "./HistoryControls";
import { defaultBranchId } from "@/lib/showroom/catalog-filters";
import { ShowroomContactLink } from "./ShowroomContactLink";
import { handoffPreferences, selectedProductReferences } from "@/lib/assistant/chat/handoff";
import { AssistantProductCard, AssistantComparisonCard } from "./AssistantProductCard";
import { AssistantThread, type MariposaMessage } from "./AssistantThread";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import type { ChatCard, ChatReply } from "@/lib/assistant/chat/contracts";
import { hasSensitiveText } from "@/lib/assistant/chat/contracts";
import {requestContinuedTurn,readPendingTurn,writePendingTurn,subscribePendingTurn} from '@/lib/assistant/chat/continuation-client';
import { browseHref } from "@/lib/showroom/navigation";
import { assistantOpenEvent } from "./AssistantLink";
import { favoriteKey, favoriteRef } from "@/lib/showroom/favorites";
import { occasions } from "./site-content";

import type { PublicBranch } from "@/lib/showroom/contracts";
import type { OutfitAction, OutfitContext, OutfitSlot } from "@/lib/assistant/chat/outfit-contracts";
import { emptyOutfit } from "@/lib/assistant/chat/outfit-contracts";
import { InquiryForm } from "./InquiryForm";
import { useTabState, useNewConversation } from "./TabState";
import { comparisonState, conversationState, emptyConversation } from "@/lib/showroom/tab-state";

type Message = MariposaMessage;
export function ChatSelectionEntry({ availability, branches, historyEnabled=false, historyHandoffEnabled=false, ownerTest=false }: { availability: "off" | "login" | "ready" | "forbidden"; branches: PublicBranch[]; historyEnabled?:boolean; historyHandoffEnabled?:boolean; ownerTest?:boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), sending = useRef(false), transcript = useRef<HTMLElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const storedPendingTurn=useSyncExternalStore(subscribePendingTurn,readPendingTurn,()=>null);
  const pendingTurn=ownerTest?storedPendingTurn:null;
  useEffect(() => () => { activeRequest.current?.abort(); }, []);
  const [saved, save] = useTabState("conversation", conversationState, emptyConversation);
  const clearSaved = useNewConversation();
  const historyReset = useRef<(() => void) | null>(null);
  const registerHistoryReset = useCallback((reset: (() => void) | null) => { historyReset.current = reset; }, []);
  const branchId = defaultBranchId(branches, branches.some(branch => branch.id === saved.branchId) ? saved.branchId : "");
  const setBranchId = (branchId: string) => save(old => ({ ...old, branchId }));
  const [comparisonRefs, saveComparison] = useTabState("comparison", comparisonState, []);
  const [liveComparison, setLiveComparison] = useState<{ productId: string; executionId: string | null; name: string }[]>([]);
  const comparison = comparisonRefs.map(ref => liveComparison.find(item => favoriteKey(item) === favoriteKey(ref)) ?? { ...ref, name: "Открыть и проверить сохранённый товар" });
  const setComparison = useCallback((items: typeof liveComparison) => {
    setLiveComparison(items);
    saveComparison(items.map(({ productId, executionId }) => ({ productId, executionId })));
  }, [saveComparison]);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const messages: Message[] = saved.messages.map((message, index) => liveMessages[index]?.content === message.content ? liveMessages[index] : { ...message, historical: true });
  const setMessages = (update: Message[] | ((old: Message[]) => Message[])) => {
    const next = typeof update === "function" ? update(messages) : update;
    setLiveMessages(next.slice(-8));
    save(old => ({ ...old, messages: next.slice(-8).map(({ role, content }) => ({ role, content })) }));
  };
  const draft = saved.draft;
  const setDraft = useCallback((value: string | ((old: string) => string)) => save(old => ({ ...old, draft: typeof value === "function" ? value(old.draft) : value })), [save]);
  const [synthetic, setSynthetic] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const context = saved.context;
  const selectedProducts = (saved.selectedProducts ?? []).filter(item => context?.selected[item.slot] === item.variantId);
  const setContext = (value: OutfitContext | undefined | ((old: OutfitContext | undefined) => OutfitContext | undefined)) => save(old => ({ ...old, context: typeof value === "function" ? value(old.context) : value }));
  const [outfit, setOutfit] = useState<Partial<Record<OutfitSlot, ChatCard>>>({});
  const [choices, setChoices] = useState<NonNullable<ChatReply["choices"]>>([]);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [periodEditing, setPeriodEditing] = useState(false);
  const { from, until } = saved;
  const setFrom = (from: string) => save(old => ({ ...old, from }));
  const setUntil = (until: string) => save(old => ({ ...old, until }));
  useEffect(() => {
    const open = (event: Event) => {
      if (sending.current) return;
      const occasion = (event as CustomEvent<{ occasion?: string }>).detail?.occasion;
      if (occasion && occasions.some(value => value === occasion)) setDraft(current => (current ? current + "\n" : "") + "Событие: " + occasion);
      const candidates = (event as CustomEvent<{ products?: unknown }>).detail?.products;
      if (Array.isArray(candidates)) {
        const safe = candidates.slice(0, 4).flatMap(item => {
          if (!item || typeof item !== "object" || typeof item.name !== "string" || item.name.length > 160) return [];
          const parsed = favoriteRef.safeParse({ productId: item.productId, executionId: item.executionId });
          return parsed.success ? [{ ...parsed.data, name: item.name }] : [];
        });
        setComparison(safe);
        if (safe.length) setDraft(current => { const next = (current ? current + "\n" : "") + "Помогите сравнить варианты: " + safe.map(item => item.name).join("; ") + "."; return next.length <= 700 ? next : current; });
      }
      dialog.current?.showModal();
    };
    window.addEventListener(assistantOpenEvent, open);
    return () => window.removeEventListener(assistantOpenEvent, open);
  }, [setDraft, setComparison]);
  async function send(event?: FormEvent<HTMLFormElement>, action?: OutfitAction, actionText?: string, periodContext?: OutfitContext) {
    event?.preventDefault();
    if (sending.current || availability !== "ready" || !synthetic) return;
    const resuming=Boolean(pendingTurn);
    const content = actionText ?? draft.trim();
    if (!content && !resuming) return;
    if (hasSensitiveText(content)) { setError("Не отправляйте контакты, имена, документы или ссылки в AI-чат. Контакт для обращения укажите отдельно в форме передачи."); return; }
    const next: Message[] = resuming?messages:[...(action?.type === "period" ? [] : messages.slice(-8)), { role: "user", content }];
    const payload = { syntheticOnly: true, ...(branchId ? { branchId } : {}), context: periodContext ?? context, action, ...(comparisonRefs.length ? { products: comparisonRefs } : {}), messages: next.map(message => ({ role: message.role, content: message.content })) };
    if (next.length > 9 || new TextEncoder().encode(JSON.stringify(payload)).length > 12000) { setError("Лимит тестового диалога исчерпан. Начните новый диалог."); return; }
    const controller = new AbortController(); activeRequest.current = controller;
    sending.current = true; setPending(true); setError("");
    const key=pendingTurn??crypto.randomUUID();
    if(ownerTest){writePendingTurn(key);if(!resuming)setMessages(next);}
    try {
      const response = ownerTest?await requestContinuedTurn(payload,key,resuming,controller.signal):await fetch('/api/showroom/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:controller.signal});
      const data = await response.json();
      if (controller.signal.aborted || activeRequest.current !== controller) return;
      if (!response.ok) {
        // Explicit result lookup can release the local pointer to a terminal row.
        // The immutable checkpoint and ledger remain; this never retries a request.
        if(ownerTest&&resuming&&response.status===409&&['blocked','expired'].includes(data.continuation?.status))writePendingTurn(null);
        if (response.status === 401) { clearSaved(); setLiveMessages([]); setOutfit({}); setNeedsLogin(true); } throw new Error(data.error || (data.continuation ? 'Проверка остановлена или срок ожидания истёк. Повторной оплаты нет; результат требует проверки.' : "Помощник временно недоступен.")); }
      if(ownerTest)writePendingTurn(null);
      const answer = data as ChatReply;
      setMessages([...next, { role: "assistant", content: answer.message, cards: answer.cards, facts: answer.facts, comparisons: answer.comparisons, slot: answer.context?.activeSlot }]); if (!action) setDraft("");
      if (action?.type === "period") setPeriodEditing(false);
      save(old => ({ ...old, context: answer.context, selectedProducts: selectedProductReferences(answer.context, answer.outfit, old.selectedProducts) })); if (answer.context) { setFrom(answer.context.from ?? ""); setUntil(answer.context.until ?? ""); } setOutfit(answer.outfit ?? {}); setChoices(answer.choices ?? []);
      if (action?.type === "finish" && Object.keys(answer.outfit ?? {}).length) setInquiryOpen(true);
      requestAnimationFrame(() => { const pane = transcript.current; if (pane) pane.scrollTop = action?.type === "finish" ? 0 : pane.scrollHeight; });
    } catch (cause) { if (controller.signal.aborted || activeRequest.current !== controller) return; setError(cause instanceof Error ? cause.message : "Связь прервалась. Запрос автоматически не повторяется."); }
    finally { if (activeRequest.current === controller) { activeRequest.current = null; sending.current = false; setPending(false); } }
  }
  function cancelRead() {
    activeRequest.current?.abort(); activeRequest.current = null; sending.current = false; setPending(false);
  }
  function editPeriod() {
    if (sending.current) return;
    setPeriodEditing(true); setOutfit({}); setChoices([]); setInquiryOpen(false); setError("");
    setMessages(current => current.map(message => ({ ...message, cards: undefined })));
  }
  function confirmPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !until || until <= from) { setError("Возврат должен быть позже получения. Выберите дату выдачи и дату возврата."); return; }
    const nextContext = { ...(context ?? emptyOutfit()), from:from.slice(0,10)+"T15:00", until:until.slice(0,10)+"T12:00", calendarPeriod: true, dateDraft: undefined };
    void send(undefined, { type: "period" }, "Период выбран в календаре", nextContext);
  }
  function newConversation() { if (pendingTurn) return; if (historyReset.current) { historyReset.current(); return; } clearConversation(); }
  function clearConversation() { cancelRead(); clearSaved(); setMessages([]); setSynthetic(false); setInquiryOpen(false); setComparison([]); setError(""); setDraft(""); setContext(undefined); setOutfit({}); setChoices([]); setFrom(""); setUntil(""); setPeriodEditing(false); }
  const selectedCards = Object.values(context ? outfit : {}).filter((card): card is ChatCard => Boolean(card));
  return <>
    <dialog id="assistant-dialog" className="selection-dialog chat-dialog" ref={dialog} onCancel={cancelRead} onClose={cancelRead} aria-labelledby="assistant-title"><div className="selection-dialog-header"><h2 id="assistant-title">MARIPOSA · Подбор</h2><button type="button" disabled={pending || Boolean(pendingTurn)} onClick={newConversation}>Новый диалог</button><button autoFocus type="button" onClick={() => dialog.current?.close()} aria-label="Закрыть помощника">Закрыть ×</button></div>
      {historyEnabled && <p role="status">{ownerTest ? "Владельческий тест на основном каталоге. Сообщения AI обрабатывает OpenAI. Подтверждённая передача создаёт настоящее обращение в CRM, без бронирования и оплаты." : "Изолированная тестовая среда. Используйте только синтетические данные. AI выключен; передача создаёт тестовое обращение без бронирования."}</p>}
      <HistoryControls enabled={historyEnabled} handoffEnabled={historyHandoffEnabled} allowDelete={!ownerTest} snapshot={{ ...saved, branchId }} registerReset={registerHistoryReset} onReset={clearConversation} onRestore={value => { cancelRead(); save(value); setLiveMessages([]); setOutfit({}); setChoices([]); setInquiryOpen(false); }} />
      {comparison.length > 0 && <div className="chat-comparison"><p>{availability === "off" ? "Выбранные варианты сохранены в этом браузере. Помощнику ничего не отправлено." : "Выбрано для обсуждения — отправьте сообщение, когда будете готовы."}</p>{availability === "ready" && <button type="button" disabled={pending || !synthetic} onClick={() => void send(undefined, { type: "compare" }, "Проверить выбранные карточки")}>Проверить выбранные карточки</button>}{comparison.map(item => <Link key={item.productId + item.executionId} href={browseHref({ search: "", categoryId: "", page: 1 }, item)}>{item.name}</Link>)}</div>}
      {(comparison.length > 0 || context) && <details className="chat-handoff-draft"><summary>Подготовить обсуждение с сотрудником</summary><p role="status">Черновик не отправлен. Заявка в CRM не создана.</p><p>Филиал: {branches.find(branch => branch.id === branchId)?.name ?? "уточнить"}{branchId && <> · {branches.find(branch => branch.id === branchId)?.timezone}</>}</p><p style={{ whiteSpace: "pre-line" }}>{handoffPreferences(context)}</p>{selectedProducts.length > 0 && <div aria-label="Сохранённый выбор для обсуждения"><p>Выбранные вещи восстановлены как ссылки. Размер, публикацию и наличие нужно перепроверить перед заявкой.</p>{selectedProducts.map(item => <Link key={item.slot} href={browseHref({ search: "", categoryId: "", page: 1 }, item)}>{item.slot === "dress" ? "Платье" : item.slot === "shoes" ? "Обувь" : "Аксессуар"} — открыть сохранённый товар</Link>)}</div>}{comparison.length > 0 && <p>Вариантов для сравнения: {comparison.length}. Ссылки выше; публикацию, точный размер, цену и наличие нужно перепроверить.</p>}<Link href="/showroom?view=contacts" onClick={() => dialog.current?.close()}>Связаться с шоурумом</Link></details>}
      {availability === "off" ? <div role="status"><p>Разговорный помощник ещё не подключён. Пока можно выбрать платье в каталоге, подготовить пожелания к примерке и связаться с шоурумом. {historyEnabled ? (ownerTest ? "Сохранение и передача настоящего обращения доступны выше." : "Сохранение и передача тестовой истории доступны выше.") : "Онлайн-отправка заявок пока закрыта."}</p><ShowroomContactLink /><Link href="/showroom?view=catalog" onClick={() => dialog.current?.close()}>Открыть каталог</Link></div> : availability === "login" || needsLogin ? <div><p>Сейчас помощник тестируется только сотрудниками PILOT.</p><Link href="/login">Войти как сотрудник</Link><p>После входа вернитесь в витрину.</p><ShowroomContactLink /></div> : availability === "forbidden" ? <div role="status"><p>Для тестирования нужны права сотрудника на просмотр каталога PILOT.</p><ShowroomContactLink /></div> : <>
        {messages.some(message => message.historical) && <p role="status">Восстановлена история, а не подтверждение наличия. <button type="button" disabled={pending || !synthetic || !branchId} onClick={() => void send(undefined, { type: "restore" }, "Перепроверить сохранённый выбор")}>Перепроверить выбранные вещи</button></p>}<div className="chat-context"><label>Филиал<select value={branchId} disabled={pending || inquiryOpen} onChange={event => { if (context?.from && context.until) editPeriod(); else { setOutfit({}); setChoices([]); setInquiryOpen(false); } setBranchId(event.target.value); setMessages(current => current.map(message => ({ ...message, cards: undefined }))); setError(""); }}><option value="" disabled>Выберите филиал</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.city} — {branch.name}</option>)}</select></label><label className="chat-synthetic"><input type="checkbox" checked={synthetic} onChange={event => setSynthetic(event.target.checked)} disabled={pending} />{ownerTest ? "Отправлять сообщения OpenAI без имён, контактов и документов" : "PILOT: вымышленный запрос, без личных данных"}</label></div>
        {!periodEditing && context?.from && context.until && <div className="chat-period-summary"><span>{rentalPeriodLabel(context.from,context.until)}</span><button type="button" disabled={pending || inquiryOpen} onClick={editPeriod}>Изменить даты</button></div>}
        <section className="chat-transcript" ref={transcript} role="log" aria-live="polite" aria-label="Диалог">{periodEditing && <form className="chat-period-form" onSubmit={confirmPeriod}><h3>На какие даты нужен наряд?</h3><button type="button" disabled={pending} onClick={() => setPeriodEditing(false)}>Вернуться к разговору</button><p>{RENTAL_CONDITIONS}</p><label>Получение<input type="date" required value={from.slice(0,10)} onChange={event => setFrom(event.target.value)} disabled={pending} /></label><label>Возврат<input type="date" required min={from.slice(0,10) || undefined} value={until.slice(0,10)} onChange={event => setUntil(event.target.value)} disabled={pending} /></label><p>Затем подберём платье, размер и дополнения. При смене периода проверим выбранные вещи заново.</p>{error && <p role="alert">{error}</p>}<button className="primary" disabled={pending || !synthetic || !branchId}>{pending ? "Проверяем период…" : "Продолжить"}</button>{Object.values(context?.selected ?? {}).some(Boolean) && <button type="button" disabled={pending} onClick={() => { if (sending.current) return; setContext(current => current ? { ...current, selected: { dress: null, shoes: null, accessory: null } } : current); setOutfit({}); setError(""); }}>Очистить выбранные вещи, сохранить пожелания</button>}</form>}<div hidden={inquiryOpen || periodEditing}>{!messages.length && <p>Для какого события ищете платье? Расскажите о пожеланиях. Размер и даты можно уточнить по ходу подбора.</p>}
          <AssistantThread messages={messages} pending={pending} onCancel={cancelRead} onSend={text => send(undefined, undefined, text)} renderMessage={message => <article className={`chat-message chat-${message.role}`}><strong>{message.role === "user" ? "Вы" : "MARIPOSA"}</strong>{message.historical && message.role === "assistant" ? <details><summary>Предыдущий ответ — цены и наличие неактуальны</summary><p>{message.content}</p></details> : <p>{message.content}</p>}{message.role === "assistant" && !message.historical && <AssistantFactPanels facts={message.facts} />}{message.cards && message.cards.length > 0 && <div className="selection-results">{message.cards.map(card => <AssistantProductCard key={card.item.id} card={card} pending={pending} onSelect={() => void send(undefined, { type: "select", slot: card.slot ?? message.slot ?? "dress", variantId: card.item.id }, `Выбираю: ${card.item.name}, размер ${card.item.size}`)} />)}</div>}{message.comparisons?.length ? <div className="selection-results">{message.comparisons.map(product => <AssistantComparisonCard key={product.id} product={product} />)}</div> : null}</article>} />
        </div>{inquiryOpen && selectedCards[0] && context?.from && context.until && <InquiryForm requestText={handoffPreferences(context)} item={selectedCards[0].item} additionalItems={selectedCards.slice(1).map(card => card.item)} filters={{ branchId, from: context.from, until: context.until, size: selectedCards[0].item.size, search: "" }} branchLabel={branches.find(branch => branch.id === branchId)?.name ?? ""} onNewSearch={() => setInquiryOpen(false)} />}</section>
        <div className="chat-bottom" hidden={inquiryOpen || periodEditing}>{selectedCards.length > 0 && <div className="outfit-summary" aria-label="Ваш выбор"><details><summary>Выбрано вещей: {selectedCards.length}</summary>{(Object.entries(context ? outfit : {}) as [OutfitSlot, ChatCard][]).map(([slot, card]) => <div key={slot}><span>{card.item.name} · {card.item.size}</span><button type="button" disabled={pending} onClick={() => void send(undefined, { type: "remove", slot }, `Убрать ${slot === "dress" ? "платье" : slot === "shoes" ? "обувь" : "аксессуар"}`)}>Убрать</button></div>)}</details><button type="button" disabled={pending} onClick={() => void send(undefined, { type: "finish" }, "Перейти к заявке на выбранное")}>Оставить заявку на выбранное</button></div>}{context?.heightCm && <p>Рост {context.heightCm} см — ориентир; размер и посадку нужно уточнить.</p>}<div className="chat-choices">{context?.nextSearch && <button type="button" disabled={pending} onClick={() => void send(undefined, { type: "more", slot: context.nextSearch!.slot }, "Ещё варианты по тем же условиям")}>Ещё варианты</button>}{choices.map(choice => <button type="button" key={choice.categoryId ?? choice.slot} disabled={pending} onClick={() => void send(undefined, { type: "search", slot: choice.slot, categoryId: choice.categoryId }, choice.label)}>{choice.label}</button>)}</div>{pending && <p role="status">Проверяем запрос… <button type="button" onClick={cancelRead}>Остановить</button></p>}{error && <p role="alert">{error}</p>}{pendingTurn && !pending && <button type="button" disabled={!synthetic} onClick={() => void send()}>Проверить результат без повторной отправки</button>}<form onSubmit={send} className="chat-compose"><label>Сообщение<textarea name="message" required maxLength={700} rows={2} value={draft} onChange={event => setDraft(event.target.value)} disabled={pending || !synthetic || Boolean(pendingTurn)} placeholder="Жёлтое платье, размер 140…" /></label><button className="primary" disabled={!synthetic || !branchId || pending || !draft.trim()}>{pending ? "Ждём…" : "Отправить"}</button></form><div className="chat-footer"><button type="button" disabled={pending} onClick={() => setPeriodEditing(true)}>Выбрать даты</button><span>Бронь подтверждает сотрудник. История и пожелания сохраняются в этой вкладке до 30 минут. Наличие нужно перепроверить.</span></div></div>
      </>}
    </dialog>
  </>;
}
