import { z } from "zod";
import type { PublicVariant, PublicPhoto, PublicProductDetail } from "@/lib/showroom/contracts";
import { outfitActionSchema, outfitContextSchema, type OutfitContext, type OutfitSlot } from "./outfit-contracts";
export const chatInput = z.object({
  syntheticOnly: z.literal(true),
  branchId: z.string().uuid().optional(),
  context: outfitContextSchema.optional(),
  action: outfitActionSchema.optional(),
  products: z.array(z.object({ productId: z.string().uuid(), executionId: z.string().uuid().nullable() }).strict()).max(4).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(700) }).strict()).min(1).max(9)
}).strict().refine(value => value.messages.every((message, index) => message.role === (index % 2 ? "assistant" : "user")) && value.messages.at(-1)?.role === "user", "Invalid conversation sequence");
export type ChatInput = z.infer<typeof chatInput>;
export type ChatCard = { slot?: OutfitSlot; productId: string; executionId: string | null; item: PublicVariant; branchId: string; from: string; until: string; images?: PublicPhoto[]; reasons?: string[] };
export type ChatReply = { message: string; cards: ChatCard[]; comparisons?: PublicProductDetail[]; context?: OutfitContext;
  outfit?: Partial<Record<OutfitSlot, ChatCard>>;
  choices?: { label: string; slot: OutfitSlot; categoryId?: string }[] };
export function hasSensitiveText(text: string) {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|\+\d[\d ()-]{7,}|\d{10,}|(?:\d{3}[ ()-]+){2}\d{2}[ -]?\d{2}|паспорт|иин|меня зовут|реб[её]нка зовут|дочь зовут|сын[а]? зовут|домашний адрес/iu.test(text);
}
