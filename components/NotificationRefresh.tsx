"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Refresh only this read-only work queue; every server read checks current access. */
export function NotificationRefresh({ updatedAt }: { updatedAt: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pending = useRef(false);

  useEffect(() => { pending.current = isPending; }, [isPending]);
  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || pending.current || Date.now() - lastRefresh < 5000) return;
      lastRefresh = Date.now();
      pending.current = true;
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, startTransition]);

  return <p data-notifications-updated-at={updatedAt}>
    Список обновляется раз в минуту, пока вкладка открыта, и при возвращении к ней.
    <span role="status" aria-live="polite">{isPending ? " Обновляем…" : ""}</span>
  </p>;
}
