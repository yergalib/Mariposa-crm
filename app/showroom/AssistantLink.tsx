"use client";
import { occasions } from "./site-content";
import type { PublicBrowseCard } from "@/lib/showroom/contracts";
export const assistantOpenEvent = "mariposa:open-selection";
export function AssistantLink({ children, occasion, products = [], className = "", disabled = false }: { children: React.ReactNode; occasion?: typeof occasions[number]; products?: PublicBrowseCard[]; className?: string; disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={className} onClick={() => window.dispatchEvent(new CustomEvent(assistantOpenEvent, { detail: { occasion, products: products.slice(0, 4).map(item => ({ productId: item.productId, executionId: item.executionId, name: item.name })) } }))}>{children}</button>;
}
