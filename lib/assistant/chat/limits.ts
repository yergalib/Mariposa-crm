export class AssistantError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export const CHAT_LIMITS = { modelCalls: 1, toolCalls: 1, outputTokens: 600, contextBytes: 24000, historyBytes: 9000, timeoutMs: 25000 } as const;
export async function untilAborted<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new AssistantError("Время ожидания истекло. Новый запрос отправляйте вручную.", 504);
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new AssistantError("Время ожидания истекло. Новый запрос отправляйте вручную.", 504));
    signal.addEventListener("abort", stop, { once: true });
    Promise.resolve().then(() => { if (signal.aborted) { stop(); return; } return operation(); }).then(value => { if (!signal.aborted) resolve(value as T); }, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}
// Process-local protection only. NOT a distributed quota or a monetary cap.
const buckets = new Map<string, { hour: number; minute: number; hourly: number; minutely: number }>();
let inFlight = 0;
export function enterProcessLimit(membershipId: string, now = Date.now()) {
  for (const [key, value] of buckets) if (now - value.hour >= 3600000) buckets.delete(key);
  if (inFlight >= 2 || (!buckets.has(membershipId) && buckets.size >= 128)) throw new AssistantError("Помощник занят. Попробуйте позже.", 429);
  const bucket = buckets.get(membershipId) ?? { hour: now, minute: now, hourly: 0, minutely: 0 };
  if (now - bucket.minute >= 60000) { bucket.minute = now; bucket.minutely = 0; }
  if (bucket.hourly >= 20 || bucket.minutely >= 4) throw new AssistantError("Лимит тестовых запросов этого процесса исчерпан. Попробуйте позже.", 429);
  bucket.hourly++; bucket.minutely++; buckets.set(membershipId, bucket); inFlight++;
  let released = false;
  return () => { if (!released) { inFlight--; released = true; } };
}
