"use client";
import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode, type SetStateAction } from "react";
import type { z } from "zod";
import { readTabState, TAB_EVENT } from "@/lib/showroom/tab-state";
import { activateBrowserTabScope, browserTabSnapshot, clearBrowserTabState, writeBrowserTabState } from "@/lib/showroom/browser-tab-state";
const Context = createContext({ scope: "", deadline: 0 });
function subscribe(callback: () => void) { window.addEventListener(TAB_EVENT, callback); const timer = window.setInterval(callback, 15000); return () => { window.removeEventListener(TAB_EVENT, callback); window.clearInterval(timer); }; }
export function TabState({ scope, deadline, children }: { scope: string; deadline: number; children: ReactNode }) {
  useEffect(() => { activateBrowserTabScope(scope); }, [scope]);
  return <Context.Provider value={{ scope, deadline }}>{children}</Context.Provider>;
}
export function useTabState<T>(bucket: string, schema: z.ZodType<T>, initial: T): [T, (value: SetStateAction<T>) => void] {
  const { scope, deadline } = useContext(Context);
  const snapshot = useCallback(() => browserTabSnapshot(scope, bucket, schema, deadline), [scope, bucket, schema, deadline]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const state = readTabState(raw, schema) ?? initial;
  const update = useCallback((value: SetStateAction<T>) => {
    const current = readTabState(snapshot(), schema) ?? initial;
    const next = typeof value === "function" ? (value as (old: T) => T)(current) : value;
    writeBrowserTabState(scope, bucket, schema, next, deadline);
  }, [snapshot, initial, scope, bucket, schema, deadline]);
  return [state, update];
}
export function useNewConversation() {
  const { scope } = useContext(Context);
  return () => { clearBrowserTabState(); activateBrowserTabScope(scope); };
}
