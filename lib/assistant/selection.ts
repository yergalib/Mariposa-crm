import type { PublicCatalog, PublicVariant } from "@/lib/showroom/contracts";

// Channel-neutral, explicit fields only. No free-text date interpretation or mutations.
export type SelectionCriteria = { branchId: string; size: string; from: string; until: string; search: string };
export type SelectionStep = "branch" | "size" | "dates";
export interface SelectionAdapter {
  findOptions(criteria: SelectionCriteria, page: number): Promise<PublicCatalog>;
}
// A handoff is a form draft, never permission to create a reservation or inquiry.
export type SelectionHandoff = { item: PublicVariant; filters: SelectionCriteria };
