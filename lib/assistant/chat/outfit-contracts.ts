import { z } from "zod";
export const slotSchema = z.enum(["dress", "shoes", "accessory"]);
export type OutfitSlot = z.infer<typeof slotSchema>;
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable();
const slotCriteria = z.object({ size: z.string().max(40).nullable(), color: z.string().max(50).nullable(), categoryId: z.string().uuid().nullable() }).strict();
export const outfitContextSchema = z.object({
  activeSlot: slotSchema, from: localDate, until: localDate, calendarPeriod: z.boolean().optional(),
  criteria: z.object({ dress: slotCriteria, shoes: slotCriteria, accessory: slotCriteria }).strict(),
  selected: z.object({ dress: z.string().uuid().nullable(), shoes: z.string().uuid().nullable(), accessory: z.string().uuid().nullable() }).strict()
}).strict();
export type OutfitContext = z.infer<typeof outfitContextSchema>;
export const outfitActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("search"), slot: slotSchema, categoryId: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("select"), slot: slotSchema, variantId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("remove"), slot: slotSchema }).strict(),
  z.object({ type: z.literal("finish") }).strict(),
  z.object({ type: z.literal("period") }).strict(),
  z.object({ type: z.literal("restore") }).strict()
]);
export type OutfitAction = z.infer<typeof outfitActionSchema>;
export function emptyOutfit(): OutfitContext {
  return { activeSlot: "dress", from: null, until: null,
    criteria: { dress: { size: null, color: null, categoryId: null }, shoes: { size: null, color: "", categoryId: null }, accessory: { size: "", color: "", categoryId: null } },
    selected: { dress: null, shoes: null, accessory: null } };
}
