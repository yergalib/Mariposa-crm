"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function MobileMenu({ children }: { children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => { if (details.current) details.current.open = false; };
    window.addEventListener("popstate", close);
    window.addEventListener("hashchange", close);
    return () => {
      window.removeEventListener("popstate", close);
      window.removeEventListener("hashchange", close);
    };
  }, []);
  return <details className="site-mobile-menu" ref={details}>
    <summary aria-label="Открыть меню">Меню</summary>
    <nav aria-label="Мобильная навигация" onClick={event => {
      // Native link/button clicks include keyboard activation; summary keeps its native toggle.
      if (event.target instanceof Element && event.target.closest("a, button") && details.current) details.current.open = false;
    }}>{children}</nav>
  </details>;
}
