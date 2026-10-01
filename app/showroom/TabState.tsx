"use client";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode, type SetStateAction } from "react";
import type { z } from "zod";
import { activateTabScope, clearTabState, expireTabState, readTabState, TAB_ACTIVE, TAB_EVENT, TAB_PREFIX, writeTabState } from "@/lib/showroom/tab-state";
const Context = createContext({ scope: "", deadline: 0 });
const notify = () => window.dispatchEvent(new Event(TAB_EVENT));
function subscribe(callback: () => void) { window.addEventListener(TAB_EVENT, callback); const timer = window.setInterval(callback, 15000); return () => { window.removeEventListener(TAB_EVENT, callback); window.clearInterval(timer); }; }
export function TabState({ scope, deadline, children }: { scope: string; deadline: number; children: ReactNode }) {
  useEffect(() => {
    try { activateTabScope(sessionStorage, scope); expireTabState(sessionStorage); notify(); } catch { /* Disabled storage: no persistence. */ }
    const timer = window.setInterval(() => { try { expireTabState(sessionStorage); notify(); } catch { /* Storage may be disabled. */ } }, 15000);
    return () => window.clearInterval(timer);
  }, [scope]);
  return <Context.Provider value={{ scope, deadline }}>{children}</Context.Provider>;
}
export function useTabState<T>(bucket: string, schema: z.ZodType<T>, initial: T): [T, (value: SetStateAction<T>) => void] {
  const { scope, deadline } = useContext(Context);
  const [volatile, setVolatile] = useState<T | null>(null);
  const key = TAB_PREFIX + scope + ":" + bucket;
  const snapshot = useCallback(() => {
    try {
      if (!scope || deadline <= Date.now() || sessionStorage.getItem(TAB_ACTIVE) !== scope) return "";
      const raw = sessionStorage.getItem(key) ?? "";
      return readTabState(raw, schema) === null ? "" : raw;
    } catch { return ""; }
  }, [scope, deadline, key, schema]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const state = readTabState(raw, schema) ?? volatile ?? initial;
  const update = useCallback((value: SetStateAction<T>) => {
    const current = readTabState(snapshot(), schema) ?? volatile ?? initial;
    const next = typeof value === "function" ? (value as (old: T) => T)(current) : value;
    try { writeTabState(sessionStorage, scope, bucket, schema, next, deadline); notify(); } catch { setVolatile(next); }
  }, [snapshot, volatile, initial, scope, bucket, schema, deadline]);
  return [state, update];
}
export function useNewConversation() {
  const { scope } = useContext(Context);
  return () => { try { clearTabState(sessionStorage); activateTabScope(sessionStorage, scope); notify(); } catch { /* Storage may be disabled. */ } };
}
