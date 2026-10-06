"use client";
import { useEffect } from "react";
import { clearBrowserTabState } from "@/lib/showroom/browser-tab-state";
export function ClearConversation() {
  useEffect(() => { clearBrowserTabState(); }, []);
  return null;
}
