import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { assertPilotSession, pilotWindow } from '@/lib/assistant/pilot-test';
import { PILOT_TEST } from '@/lib/assistant/pilot-test-config';
import { emptyOutfit } from '@/lib/assistant/chat/outfit-contracts';
import type { HistorySnapshot } from '@/lib/assistant/history/contracts';
import { PilotHistoryTestPanel } from './panel';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pilot: синтетический тест', robots: { index: false, follow: false } };
export default async function PilotHistoryTestPage() {
  const session = await getCurrentSession(); if (!session) redirect('/login');
  try { assertPilotSession(session); } catch { return <main><h1>Тест недоступен</h1><p>Нужна разрешённая учётная запись Pilot OWNER и согласованный Preview.</p></main>; }
  const context = emptyOutfit(); context.selected.dress = PILOT_TEST.variantId; context.notes = [`[E2E PILOT ${PILOT_TEST.runId}]`];
  const snapshot: HistorySnapshot = { branchId: PILOT_TEST.branchId, from: '', until: '', draft: '', context,
    selectedProducts: [{ slot: 'dress', productId: PILOT_TEST.productId, executionId: null, variantId: PILOT_TEST.variantId }],
    messages: [{ role: 'user', content: '[E2E] Синтетический запрос: проверить сохранение и передачу выбранного товара без брони.' },
      { role: 'assistant', content: '[E2E] Тестовая запись, не ответ AI. Передача ещё не выполнена; резерв и оплата не создаются.' }] };
  return <PilotHistoryTestPanel initialWindow={await pilotWindow()} initialSnapshot={snapshot} runId={PILOT_TEST.runId} contact={PILOT_TEST.contact} />;
}
