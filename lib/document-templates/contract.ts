import { createHash } from "node:crypto";
import { z } from "zod";
import { templateKindSchema, type TemplateKind } from "./catalog";
export { validateTemplateBody } from "./catalog";
export type { TemplateKind } from "./catalog";

export function templateContentHash(kind: TemplateKind, body: string) {
  return createHash("sha256").update(JSON.stringify({ rendererVersion: 1, kind, body })).digest("hex");
}
export const createTemplateInput = z.object({
  branchId: z.string().uuid().nullable(), kind: templateKindSchema,
  body: z.string().trim().min(1).max(1200),
  baseVersion: z.number().int().min(0).max(2147483646), idempotencyKey: z.string().uuid(),
}).strict();
export const transitionTemplateInput = z.object({ id: z.string().uuid(), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
