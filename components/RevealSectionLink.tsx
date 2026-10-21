"use client";

import type { ReactNode } from "react";

/** Keeps a secondary form out of the reading path and opens it on explicit intent. */
export function RevealSectionLink({ target, children }: { target: string; children: ReactNode }) {
  return <a className="secondary button-link" href={`#${target}`} onClick={event => {
    const section = document.getElementById(target);
    if (section instanceof HTMLDetailsElement) {
      event.preventDefault();
      section.open = true;
      section.scrollIntoView({ block: "start" });
      section.querySelector("summary")?.focus({ preventScroll: true });
    }
  }}>{children}</a>;
}
