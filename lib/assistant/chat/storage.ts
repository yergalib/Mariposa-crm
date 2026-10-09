import { z } from "zod";
import { hasSensitiveText } from "./contracts";
import { outfitContextSchema } from "./outfit-contracts";
// Payload only; the shared tab-state module owns the scoped storage envelope.
const text = z.string().max(700).refine(value => !hasSensitiveText(value));
const date = z.string().regex(/^(?:|\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/);
export const conversationState = z.object({ branchId: z.union([z.literal(""), z.string().uuid()]),
  context: outfitContextSchema.optional(), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: text }).strict()).max(8), draft: text, from: date, until: date
}).strict().refine(value => value.messages.length % 2 === 0 && value.messages.every((message, index) => message.role === (index % 2 ? "assistant" : "user")))
  .refine(value => !value.context?.notes?.some(hasSensitiveText))
  .refine(value => !value.context || Object.values(value.context.criteria).every(criteria => !hasSensitiveText(criteria.size ?? "") && !hasSensitiveText(criteria.color ?? "")));
export const emptyConversation: z.infer<typeof conversationState> = { branchId: "", from: "", until: "", draft: "", messages: [] };
