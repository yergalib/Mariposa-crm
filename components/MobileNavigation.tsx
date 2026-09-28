"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export function MobileNavigation({ navigation, organization }: { navigation: ReactNode; organization: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("a,button,select")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),select:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <div className="mobile-menu">
    <button ref={triggerRef} type="button" className="mobile-menu-trigger" aria-label={open ? "Закрыть меню" : "Открыть меню"} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}><Icon name="menu"/></button>
    {open && <>
      <button className="mobile-menu-backdrop" type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)}/>
      <div ref={panelRef} id={panelId} className="mobile-menu-panel" role="dialog" aria-modal="true" aria-label="Навигация MARIPOSA">
        <nav className="mobile-nav-list" aria-label="Мобильная навигация" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}>{navigation}</nav>
        <div className="mobile-organization-context">{organization}</div>
      </div>
    </>}
  </div>;
}
