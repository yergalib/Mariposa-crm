"use client";
import type { ReactNode } from "react";
import { logoutAction } from "./actions";
import { clearBrowserTabState } from "@/lib/showroom/browser-tab-state";
export function LogoutForm({ children }: { children: ReactNode }) {
  return <form action={logoutAction} onSubmit={() => {
    clearBrowserTabState();
  }}>{children}</form>;
}
