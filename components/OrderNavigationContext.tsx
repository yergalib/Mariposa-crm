"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { orderReturnPath, workspacePositionKey } from "@/lib/orders/navigation";

type Position = { x: number; y: number; focus: string | null; at: number };
const warning = "Есть несохранённые изменения. Уйти без сохранения?";
function snapshot(form: HTMLFormElement) {
  return JSON.stringify([...form.elements].flatMap(element => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return [];
    if (!element.name || element.name.startsWith("$") || /idempotencyKey|creationKey/.test(element.name)) return [];
    return [[element.name, element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) ? element.checked : element.value]];
  }));
}

/** Scoped to orders/calendar. Stores positions, never form values, in this tab and membership. */
export function OrderNavigationContext({ children, scope }: { children: ReactNode; scope: string }) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter();
  const route = pathname + (params.size ? `?${params}` : "");
  const container = useRef<HTMLDivElement>(null);
  const current = useRef(route), previous = useRef<string | null>(null), historyTravel = useRef(false);
  const positions = useRef(new Map<string, Position>()), baselines = useRef(new WeakMap<HTMLFormElement, string>());
  const dirty = useRef(new Set<HTMLFormElement>()), submitting = useRef<HTMLFormElement | null>(null);
  const restoring = useRef(false);
  const arrival = useRef<{ route: string; from: string | null; travel: boolean } | null>(null);
  const storageKey = `mariposa:orders:${scope}`;

  useEffect(() => {
    try { positions.current = new Map(JSON.parse(sessionStorage.getItem(storageKey) ?? "[]")); previous.current = sessionStorage.getItem(storageKey+":last-route"); } catch { /* Storage is optional. */ }
    const save = () => {
      if (restoring.current || !["/orders", "/calendar"].includes(current.current.split("?")[0])) return;
      const key = workspacePositionKey(current.current), old = positions.current.get(key);
      const active = document.activeElement instanceof HTMLAnchorElement ? document.activeElement : null;
      const focus = active && /^\/orders\/[0-9a-f-]{36}$/i.test(new URL(active.href).pathname) ? new URL(active.href).pathname : old?.focus ?? null;
      positions.current.delete(key);
      positions.current.set(key, { x: window.scrollX, y: window.scrollY, focus, at: Date.now() });
      while (positions.current.size > 20) positions.current.delete(positions.current.keys().next().value!);
      try { sessionStorage.setItem(storageKey, JSON.stringify([...positions.current])); } catch { /* Private storage can be unavailable. */ }
    };
    const pending = (message:string) => { const node=container.current?.querySelector<HTMLElement>("[data-order-nav-pending]");if(node){node.hidden=!message;node.textContent=message;} };
    const isDirty = () => [...dirty.current].some(form => form.isConnected && form !== submitting.current && snapshot(form) !== baselines.current.get(form));
    const initialize = () => {
      if (!/^\/orders\/(?:[0-9a-f-]{36}(?:\/edit)?|new)$/.test(location.pathname)) return;
      container.current?.querySelectorAll("form").forEach(form => { if (!baselines.current.has(form)) baselines.current.set(form, snapshot(form)); });
      if (submitting.current?.getAttribute("aria-busy") === "false") submitting.current = null;
      const alert = container.current?.querySelector<HTMLElement>('[role="alert"]');
      if (alert) pending("");
      if (alert && alert.dataset.orderFocused !== "yes") { alert.dataset.orderFocused = "yes"; alert.tabIndex = -1; alert.focus(); }
    };
    initialize();
    const observer = new MutationObserver(initialize);
    if (container.current) observer.observe(container.current, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    const change = (event: Event) => {
      const form = (event.target as HTMLInputElement).form;
      if (form && baselines.current.has(form)) dirty.current.add(form);
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank") return;
      if (link.href === location.href || link.getAttribute("href")?.startsWith("#")) return;
      if (isDirty() && !window.confirm(warning)) { event.preventDefault(); event.stopPropagation(); return; }
      dirty.current.clear(); save();
      restoring.current = true;
      if(new URL(link.href).origin===location.origin&&/^\/(orders|calendar)(?:[/?]|$)/.test(new URL(link.href).pathname)&&!link.href.includes("/export"))pending("Открываем заказ или выборку…");
      if (link.closest(".workspace-order-card,.workspace-table,.calendar-order")) {
        const key = workspacePositionKey(current.current), entry = positions.current.get(key);
        if (entry) { entry.focus = new URL(link.href).pathname; try { sessionStorage.setItem(storageKey, JSON.stringify([...positions.current])); } catch {} }
      }
    };
    const submit = (event: SubmitEvent) => { save(); if (event.target instanceof HTMLFormElement) { submitting.current = event.target; pending(event.target.matches(".workspace-filters")?"Загружаем выборку…":"Сохраняем изменения…"); } };
    const unload = (event: BeforeUnloadEvent) => { save(); if (isDirty()) { event.preventDefault(); event.returnValue = ""; } };
    // The early listener runs before Next can replace a dirty form.
    let reverting = false;
    const pop = (event: PopStateEvent, index: number, nextIndex: number) => {
      if (reverting) { reverting = false; event.stopImmediatePropagation(); return true; }
      if (isDirty() && !window.confirm(warning)) {
        event.stopImmediatePropagation(); reverting = true; history.go(index - nextIndex); return true;
      }
      save(); restoring.current = true; historyTravel.current = true; dirty.current.clear();
      return false;
    };
    window.mariposaOrderHistoryGuard = pop;
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    document.addEventListener("input", change, true); document.addEventListener("change", change, true);
    return () => {
      save(); observer.disconnect();
      if (window.mariposaOrderHistoryGuard === pop) delete window.mariposaOrderHistoryGuard;
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save); window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true); document.removeEventListener("submit", submit, true);
      document.removeEventListener("input", change, true); document.removeEventListener("change", change, true);
    };
  }, [storageKey]);

  useEffect(() => {
    if (arrival.current?.route !== route) arrival.current = { route, from: previous.current, travel: historyTravel.current };
    const { from, travel } = arrival.current, key = workspacePositionKey(route);
    current.current = route; previous.current = route; historyTravel.current = false;
    const pendingNode=container.current?.querySelector<HTMLElement>("[data-order-nav-pending]");if(pendingNode)pendingNode.hidden=true;
    const routeParams=new URLSearchParams(route.split("?")[1]??"");
    const oldUrl=from?new URL(from,"http://crm.local"):null;
    const formNavigation=!oldUrl||oldUrl.pathname!==pathname||oldUrl.searchParams.get("ok")!==routeParams.get("ok")||oldUrl.searchParams.get("error")!==routeParams.get("error");
    if(formNavigation){dirty.current.clear(); submitting.current = null; baselines.current = new WeakMap();}
    if (/^\/orders\/(?:[0-9a-f-]{36}(?:\/edit)?|new)$/.test(pathname)) container.current?.querySelectorAll("form").forEach(form=>{if(!baselines.current.has(form))baselines.current.set(form,snapshot(form));});
    try { sessionStorage.setItem(storageKey+":last-route",route); } catch {}
    const id = /^\/orders\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname)?.[1];
    if (id) {
      const context = routeParams.get("returnTo"), contextKey = `${storageKey}:order:${id}`;
      try {
        if (context) sessionStorage.setItem(contextKey, orderReturnPath(context));
        else {
          const saved = sessionStorage.getItem(contextKey);
          if (saved) { const next = new URLSearchParams(routeParams); next.set("returnTo", orderReturnPath(saved)); router.replace(`${pathname}?${next}`, { scroll: false }); }
        }
      } catch {}
    }
    if (!["/orders", "/calendar"].includes(pathname)) return;
    const position = positions.current.get(key);
    const restore = Boolean(position && Date.now() - position.at < 30 * 60_000 && (travel || from && /^\/orders\/[0-9a-f-]{36}/i.test(from)));
    restoring.current = true;
    let frame = 0;
    const ready = () => {
      const marker = container.current?.querySelector<HTMLElement>("[data-order-workspace-ready]");
      if (!marker || workspacePositionKey(marker.dataset.orderWorkspaceReady!) !== key) return;
      observer.disconnect();
      frame = requestAnimationFrame(() => {
        if (restore && position) {
          const link = [...container.current!.querySelectorAll<HTMLAnchorElement>("a[href]")].find(a => new URL(a.href).pathname === position.focus);
          link?.focus({ preventScroll: true }); window.scrollTo(position.x, position.y);
        } else if (from) window.scrollTo(0, 0);
        restoring.current = false;
      });
    };
    const observer = new MutationObserver(ready);
    if (container.current) observer.observe(container.current, { childList: true, subtree: true });
    ready();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); restoring.current = false; };
  }, [route, pathname, router, storageKey]);
  return <div ref={container} data-order-navigation><p hidden role="status" aria-live="polite" data-order-nav-pending/>{children}</div>;
}
