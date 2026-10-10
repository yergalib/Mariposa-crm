import { z } from "zod";
import { conversationState } from "../chat/storage";
export const HISTORY_DAYS = 7;
export const HISTORY_POLICY = "web-history-7d-v1";
export const HISTORY_OPEN = false;
export const historySnapshot = conversationState;
const version = z.number().int().min(1);
export const historyWrite = z.discriminatedUnion("action", [
  z.object({ action: z.literal("consent"), consent: z.literal(true), policy: z.literal(HISTORY_POLICY), key: z.string().uuid(), snapshot: historySnapshot }).strict(),
  z.object({ action: z.literal("save"), version, snapshot: historySnapshot }).strict(),
  z.object({ action: z.literal("handoff"), version, key: z.string().uuid(), confirmed: z.literal(true), contact: z.string().trim().min(5).max(254).refine(s => z.email().safeParse(s).success || (/^\+?[\d ()-]{7,25}$/.test(s) && /^\+?\d{7,15}$/.test(s.replace(/[ ()-]/g, "")))) }).strict()
]);
export type HistorySnapshot = z.infer<typeof historySnapshot>;
export type HistoryView = { version: number; expiresAt: string; snapshot: HistorySnapshot; handedOff: boolean };
// Reject obvious credentials in addition to the existing contact/document filter.
export function containsSecret(value: unknown): boolean {
  return /\b(?:sk|ghp|gho|sb_secret)[-_][A-Za-z0-9_-]{12,}|Bearer\s+\S{8,}|-----BEGIN .*PRIVATE KEY|(?:password|пароль|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+/iu.test(JSON.stringify(value));
}
