"use client";
import { useEffect } from "react";
import { clearTabState, TAB_EVENT } from "@/lib/showroom/tab-state";
export function ClearConversation() {
  useEffect(() => { try { clearTabState(sessionStorage); window.dispatchEvent(new Event(TAB_EVENT)); } catch { /* Storage may be disabled. */ } }, []);
  return null;
}
