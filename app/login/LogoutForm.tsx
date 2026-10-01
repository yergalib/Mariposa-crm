"use client";
import type { ReactNode } from "react";
import { logoutAction } from "./actions";
import { clearTabState, TAB_EVENT } from "@/lib/showroom/tab-state";
export function LogoutForm({ children }: { children: ReactNode }) {
  return <form action={logoutAction} onSubmit={() => {
    try { clearTabState(sessionStorage); window.dispatchEvent(new Event(TAB_EVENT)); } catch { /* Server logout still runs. */ }
  }}>{children}</form>;
}
