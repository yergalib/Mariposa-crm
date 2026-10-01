import { z } from "zod";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const searchInput = z.object({
  branchId: z.string().uuid(), from: localDate, until: localDate,
  search: z.string().trim().max(80).default(""), size: z.string().trim().max(40).default(""),
  page: z.coerce.number().int().min(1).max(100).default(1)
}).strict();
const contact = z.string().trim().min(5).max(254).transform(value =>
  value.includes("@") ? value.toLowerCase() : value.replace(/[ ()-]/g, "")
).refine(value => z.email().safeParse(value).success || /^\+?\d{7,15}$/.test(value));
export const publicInquiryInput = z.object({
  branchId: z.string().uuid(), variantId: z.string().uuid(), from: localDate, until: localDate,
  creationKey: z.string().uuid(), replyContact: contact,
  website: z.string().max(0) // Honeypot; never persisted.
}).strict();

export type PublicBranch = { id: string; name: string; city: string; timezone: string };
export type PublicVariant = {
  id: string; name: string; size: string; execution: string | null;
  price: { amountMinor: string; currency: string } | null;
  available: boolean;
};
export type PublicProductGroup = {
  id: string; productId: string; executionId: string | null;
  name: string; execution: string | null; color: string | null;
  variants: PublicVariant[];
};
export type PublicCatalog = { items: PublicProductGroup[]; more: boolean; page: number };
