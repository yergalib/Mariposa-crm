import { z } from "zod";
import { colorGroupIds } from "./color-groups";
const colorGroup = z.union([z.enum(colorGroupIds), z.literal("")]).default("");

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const searchInput = z.object({
  branchId: z.string().uuid(), from: localDate, until: localDate,
  color: z.string().trim().max(50).default(""), colorGroup,
  search: z.string().trim().max(80).default(""), size: z.string().trim().max(40).default(""),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1)
}).strict();
const contact = z.string().trim().min(5).max(254).transform(value =>
  value.includes("@") ? value.toLowerCase() : value.replace(/[ ()-]/g, "")
).refine(value => z.email().safeParse(value).success || /^\+?\d{7,15}$/.test(value));
export const publicBookingInquiryInput = z.object({
  purpose: z.literal("booking").default("booking"),
  preferredVisit: z.union([localDate, z.literal("")]).optional(),
  branchId: z.string().uuid(), variantId: z.string().uuid(), from: localDate, until: localDate,
  additionalVariantIds: z.array(z.string().uuid()).max(2).optional(),
  creationKey: z.string().uuid(), replyContact: contact,
  requestText: z.string().trim().max(700).optional(),
  website: z.string().max(0) // Honeypot; never persisted.
}).strict();

// A visit request is an Inquiry for staff, never a scheduled Fitting or reservation.
// Rental dates are intentionally absent: strict parsing rejects fabricated periods.
export const publicFittingInquiryInput = publicBookingInquiryInput.omit({ from: true, until: true }).extend({
  purpose: z.literal("fitting"),
  variantId: z.string().uuid().optional(),
  productId: z.string().uuid().optional()
}).strict().refine(value => !(value.productId && (value.variantId || value.additionalVariantIds?.length)), {
  message: "Укажите интерес к модели или выбранным размерам, не оба одновременно."
}).refine(value => !value.additionalVariantIds?.length || Boolean(value.variantId), {
  message: "Для дополнительных вариантов укажите основной вариант."
});
export const publicInquiryInput = z.union([publicBookingInquiryInput, publicFittingInquiryInput]);

export type PublicBranch = { id: string; name: string; city: string; timezone: string };
export type PublicVariant = {
  id: string; name: string; size: string; execution: string | null;
  price: { amountMinor: string; currency: string } | null;
  available: boolean;
};
export type PublicProductGroup = {
  id: string; productId: string; executionId: string | null;
  name: string; execution: string | null; color: string | null;
  variants: PublicVariant[]; colorLabel?: string;
};
export type PublicCatalog = { items: PublicProductGroup[]; more: boolean; page: number; appliedColor?: string | null };

export const browseInput = z.object({
  colorGroup, size: z.string().trim().max(40).default(""),
  branchId: z.union([z.string().uuid(), z.literal("")]).default(""),
  from: z.union([localDate, z.literal("")]).default(""), until: z.union([localDate, z.literal("")]).default(""),
  search: z.string().trim().max(80).default(""),
  categoryId: z.union([z.string().uuid(), z.string().startsWith("path:").max(300), z.literal("")]).default(""),
  page: z.coerce.number().int().min(1).max(100).default(1)
}).strict();
export const productInput = z.object({ productId: z.string().uuid(), executionId: z.union([z.string().uuid(), z.literal("")]).default("") }).strict();
export const selectionInput = publicBookingInquiryInput.pick({ branchId: true, variantId: true, from: true, until: true });
type ParsedBrowse = z.infer<typeof browseInput>;
export type BrowseFilters = Pick<ParsedBrowse, "search" | "categoryId" | "page"> & Partial<Omit<ParsedBrowse, "search" | "categoryId" | "page">>;
export type PublicCategory = { id: string; name: string };
export type PublicPhoto = { id: string; src: string; alt: string; width: number; height: number };
export type PublicBrowseCard = Omit<PublicProductGroup, "variants"> & { sizes: string[]; priceSummary?: { minAmountMinor: string; maxAmountMinor: string; currency: string; incomplete: boolean } | null; availableSizes?: string[]; images?: PublicPhoto[] };
export type PublicBrowse = { items: PublicBrowseCard[]; more: boolean; page: number };
export type PublicProductDetail = PublicBrowseCard & { options: { id: string; size: string; sizeCode?: string }[] };
