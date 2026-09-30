"use client";

import { useState, type ReactNode } from "react";

export function RentalResponsiveSection({ title, summary, className = "", children }: { title: string; summary?: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <section className={`rental-responsive-section ${open ? "is-open" : ""} ${className}`}>
    <button type="button" className="rental-responsive-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span><b>{title}</b>{summary && <small>{summary}</small>}</span><span aria-hidden="true">⌄</span>
    </button>
    <div className="rental-responsive-content">{children}</div>
  </section>;
}
