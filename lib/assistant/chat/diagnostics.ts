import { AssistantError } from './limits';

// Enumerated metadata only: never raw arguments, text, exceptions, IDs or headers.
export type AssistantDiagnostic = {
  stage: 'provider' | 'calendar' | 'tool' | 'review';
  outcome: 'reserved' | 'verified' | 'deadline_not_started' | 'request_unverified' | 'usage_rejected' | 'receipt_unconfirmed' | 'schema_rejected' | 'evidence_rejected' | 'missing_information' | 'read_timeout' | 'read_unavailable' | 'operation_rejected' | 'ok';
  kind?: 'planning' | 'review';
  calendarReason?: string; // Fixed server enum from calendarFailureReason; never raw errors.
  elapsedMs?: number;
  remainingMs?: number;
};
export type DiagnosticSink = (event: AssistantDiagnostic) => void;
export function emitDiagnostic(sink: DiagnosticSink | undefined, event: AssistantDiagnostic) {
  try { sink?.(event); } catch { /* Observability must not alter accounting or validation. */ }
}
// Admission floor, not a guarantee of completion. Never extends any existing timeout.
// Reviewer observations were 3.7–8.2s, before persistence/transport margin.
export const PROVIDER_START_FLOOR_MS = { planning: 6000, review: 10000 } as const;
export function assertProviderStartTime(deadlineAt: number | undefined, kind: 'planning' | 'review', sink?: DiagnosticSink, now = Date.now()) {
  if (deadlineAt === undefined) return;
  const remainingMs = Math.max(0, deadlineAt - now);
  if (!Number.isFinite(deadlineAt) || remainingMs < PROVIDER_START_FLOOR_MS[kind]) {
    emitDiagnostic(sink, {stage:'provider',kind,outcome:'deadline_not_started',remainingMs:Number.isFinite(remainingMs)?remainingMs:0});
    throw new AssistantError('Для безопасной проверки ответа не осталось времени. Новый вызов модели не начат.',504);
  }
}
