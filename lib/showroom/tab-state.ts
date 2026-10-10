import { z } from "zod";
import { hasSensitiveText } from "@/lib/assistant/chat/contracts";
export { conversationState, emptyConversation } from "@/lib/assistant/chat/storage";
import { favoriteRef } from "./favorites";
export const TAB_PREFIX = "mariposa:tab:v1:";
export const TAB_ACTIVE = "mariposa:tab-active";
export const TAB_TTL = 30 * 60 * 1000;
export const TAB_EVENT = "mariposa:tab-state";
const text = (max: number) => z.string().max(max).refine(value => !hasSensitiveText(value));
const uuidOrEmpty = z.union([z.literal(""), z.string().uuid()]);
const date = z.string().regex(/^(?:|\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/);
export const selectionState = z.object({ branchId: uuidOrEmpty, variantId: uuidOrEmpty, from: date, until: date, size: text(40) }).strict();
export const emptySelection = { branchId: "", variantId: "", from: "", until: "", size: "" };
export const fittingState = z.object({ day: z.string().regex(/^(?:|\d{4}-\d{2}-\d{2})$/), time: z.string().regex(/^(?:|\d{2}:\d{2})$/) }).strict();
export const comparisonState = z.array(favoriteRef).max(4);
export function clearTabState(storage: Storage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(TAB_PREFIX) || key?.startsWith("mariposa:synthetic-chat:")) storage.removeItem(key);
  }
  storage.removeItem(TAB_ACTIVE);
}
export function activateTabScope(storage: Storage, scope: string) {
  if (storage.getItem(TAB_ACTIVE) !== scope) { clearTabState(storage); storage.setItem(TAB_ACTIVE, scope); }
}
export function expireTabState(storage: Storage, now = Date.now()) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(TAB_PREFIX) && readTabState(storage.getItem(key) ?? "", z.unknown(), now) === null) storage.removeItem(key);
  }
}
export function readTabState<T>(raw: string, schema: z.ZodType<T>, now = Date.now()): T | null {
  try {
    if (raw.length > 14000) return null;
    const envelope = z.object({ version: z.literal(1), expiresAt: z.number().finite(), value: schema }).strict().parse(JSON.parse(raw));
    return envelope.expiresAt > now && envelope.expiresAt <= now + TAB_TTL ? envelope.value : null;
  } catch { return null; }
}
export function writeTabState<T>(storage: Storage, scope: string, bucket: string, schema: z.ZodType<T>, value: T, deadline: number, now = Date.now()) {
  if (storage.getItem(TAB_ACTIVE) !== scope || deadline <= now) return;
  const key = TAB_PREFIX + scope + ":" + bucket, parsed = schema.safeParse(value);
  if (!parsed.success) { storage.removeItem(key); return; }
  const raw = JSON.stringify({ version: 1, expiresAt: Math.min(now + TAB_TTL, deadline), value: parsed.data });
  if (raw.length <= 14000) storage.setItem(key, raw);
}
