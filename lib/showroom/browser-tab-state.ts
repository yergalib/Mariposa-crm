import type { z } from "zod";
import { activateTabScope, clearTabState, readTabState, TAB_ACTIVE, TAB_EVENT, TAB_PREFIX, TAB_TTL } from "./tab-state";

// Browser-tab memory only: never populate this module's state during server rendering.
// Four bounded, schema-validated buckets; no prices, availability or contact fields.
const buckets = new Set(["selection", "fitting", "comparison", "conversation"]);
const memory = new Map<string, string>();
let active = "";
let ignoreStorage = false;
let pendingClear = false;
const notify = () => window.dispatchEvent(new Event(TAB_EVENT));

function prepareStorage() {
  const storage = sessionStorage; // Access itself can throw in restricted browsers.
  if (pendingClear) { clearTabState(storage); pendingClear = false; }
  activateTabScope(storage, active);
  return storage;
}

export function activateBrowserTabScope(scope: string) {
  if (typeof window === "undefined" || !scope) return;
  if (active && active !== scope) clearBrowserTabState();
  active = scope;
  try { prepareStorage(); } catch { ignoreStorage = true; pendingClear = true; }
  notify();
}

export function clearBrowserTabState() {
  if (typeof window === "undefined") return;
  memory.clear();
  active = "";
  // Never resurrect pre-clear values if storage becomes available later.
  ignoreStorage = true;
  pendingClear = true;
  try { clearTabState(sessionStorage); pendingClear = false; } catch { /* Retry before the next write. */ }
  notify();
}

export function browserTabSnapshot<T>(scope: string, bucket: string, schema: z.ZodType<T>, deadline: number) {
  if (typeof window === "undefined" || !scope || active !== scope || !buckets.has(bucket)) return "";
  if (deadline <= Date.now()) { memory.clear(); ignoreStorage = true; return ""; }
  let raw = memory.get(bucket);
  if (raw === undefined && !ignoreStorage) {
    try {
      if (sessionStorage.getItem(TAB_ACTIVE) !== scope) return "";
      raw = sessionStorage.getItem(TAB_PREFIX + scope + ":" + bucket) ?? "";
      memory.set(bucket, raw.length <= 14000 ? raw : "");
    } catch { ignoreStorage = true; pendingClear = true; }
  }
  return raw && readTabState(raw, schema) !== null ? raw : "";
}

export function writeBrowserTabState<T>(scope: string, bucket: string, schema: z.ZodType<T>, value: T, deadline: number) {
  if (typeof window === "undefined" || !scope || active !== scope || !buckets.has(bucket) || deadline <= Date.now()) return;
  const parsed = schema.safeParse(value);
  let raw = parsed.success ? JSON.stringify({ version: 1, expiresAt: Math.min(Date.now() + TAB_TTL, deadline), value: parsed.data }) : "";
  if (raw.length > 14000) raw = "";
  memory.set(bucket, raw); // New input wins even when an older persisted value still exists.
  try {
    const storage = prepareStorage(), key = TAB_PREFIX + scope + ":" + bucket;
    if (raw) storage.setItem(key, raw); else storage.removeItem(key);
  } catch { ignoreStorage = true; pendingClear = true; }
  notify();
}
