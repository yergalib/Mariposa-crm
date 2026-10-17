'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HistoryControls } from '../showroom/HistoryControls';
import type { HistorySnapshot } from '@/lib/assistant/history/contracts';
type WindowState = { status: 'not_started' | 'active' | 'closed'; until: string | null; inquiryHref?: string };
const ignore = () => {};
export function PilotHistoryTestPanel({ initialWindow, initialSnapshot, runId, contact }: { initialWindow: WindowState; initialSnapshot: HistorySnapshot; runId: string; contact: string }) {
  const [window, setWindow] = useState(initialWindow), [snapshot, setSnapshot] = useState(initialSnapshot), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const read = useCallback(async () => {
    try { const response = await fetch('/api/showroom/history', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw Error(data.error); if (data.pilotTest) setWindow(data.pilotTest); setError(''); }
    catch { setError('Статус теста не подтверждён. Обновите страницу; не повторяйте отправку вслепую.'); }
  }, []);
  useEffect(() => { const timer = setInterval(() => { void read(); }, 15000); return () => clearInterval(timer); }, [read]);
  useEffect(() => { if (!window.until || window.status !== 'active') return; const timer = setTimeout(() => { void read(); }, Math.max(0, Date.parse(window.until) - Date.now()) + 500); return () => clearTimeout(timer); }, [window, read]);
  async function start() { setBusy(true); setError(''); try { const response = await fetch('/api/showroom/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start-test' }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); setWindow(data.pilotTest); } catch { setError('Запуск не подтверждён. Обновите страницу: сохранённый запуск не повторяется.'); } finally { setBusy(false); } }
  return <main style={{ maxWidth: 760, margin: '24px auto', padding: 20 }}>
    <h1>Pilot: один синтетический тест</h1><p>Это тест сохранения и передачи, не живой AI. Каталог используется только для чтения. Заказ, резерв, оплата и сообщения клиентам не создаются.</p>
    <p>Контакт: {contact}. Audit и тестовая заявка сохранятся.</p>
    <p role="status">{window.status === 'not_started' ? 'Окно ещё не запущено. Сборка его не расходует.' : window.status === 'closed' ? 'Окно закрыто. Сохранение и передача недоступны; повторный запуск запрещён.' : `Окно активно до ${new Date(window.until!).toLocaleString('ru-RU')}.`}</p>
    {window.status === 'not_started' && <button type="button" disabled={busy} onClick={() => void start()}>Начать 30-минутный тест</button>}
    {window.status === 'active' && <><section aria-label="Синтетический сценарий"><h2>Тестовый диалог — не ответ AI</h2>{snapshot.messages.map((message, i) => <p key={i}>{message.content}</p>)}<Link href={`/showroom?productId=${snapshot.selectedProducts?.[0]?.productId}`}>Проверить выбранный товар в каталоге</Link></section>
      <HistoryControls enabled handoffEnabled fixedKey={runId} fixedContact={contact} allowDelete={false} snapshot={snapshot} onRestore={setSnapshot} onReset={ignore} registerReset={ignore} />
    </>}
    {window.inquiryHref && <p><Link href={window.inquiryHref}>Открыть созданную заявку в CRM</Link></p>}
    <button type="button" onClick={() => void read()}>Проверить состояние и закрытие окна</button>{error && <p role="alert">{error}</p>}
  </main>;
}
