"use client";
import { occasions } from "./site-content";
export const assistantOpenEvent = "mariposa:open-selection";
export function AssistantLink({ children, occasion, className = "" }: { children: React.ReactNode; occasion?: typeof occasions[number]; className?: string }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent(assistantOpenEvent, { detail: { occasion } }))}>{children}</button>;
}
