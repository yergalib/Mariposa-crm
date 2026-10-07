import { createHash } from "node:crypto";
import { z } from "zod";

const quantity = z.number().int().nonnegative();
const instant = z.string().datetime().nullable();
const resolution = z.object({
  sourceId: z.string().uuid(), kind: z.enum(["RETURN", "LOSS_RESOLUTION"]),
  occurredAt: z.string().datetime(),
  lines: z.array(z.object({ outcome: z.string(), quantity, note: z.string().nullable() }).strict())
}).strict();
export const rentalSnapshotSchema = z.object({
  schemaVersion: z.literal(1), templateVersion: z.literal(1),
  capturedAt: z.string().datetime(), orderNumber: z.string(), orderStatusLabel: z.string(),
  customerName: z.string(), branchName: z.string(), timezone: z.string(),
  rentalStartAt: instant, rentalEndAt: instant,
  items: z.array(z.object({
    sourceItemId: z.string().uuid(), name: z.string(), variant: z.string(), sku: z.string(),
    trackingMode: z.enum(["BULK", "SERIALIZED"]), quantity, removed: z.boolean(),
    allocations: z.array(z.object({
      sourceAllocationId: z.string().uuid(), inventoryNumber: z.string().nullable(),
      issuedQuantity: quantity, returnedQuantity: quantity, issuedAt: instant, returnedAt: instant,
      inspection: z.string().nullable(), returnNote: z.string().nullable(),
      resolutions: z.array(resolution)
    }).strict())
  }).strict())
}).strict();
export const rentalSnapshotV2Schema = rentalSnapshotSchema.extend({ schemaVersion: z.literal(2), templateVersion: z.literal(2), issuer: z.object({ organizationName: z.string().min(1).max(100), address: z.string().max(300).nullable(), phone: z.string().max(300).nullable() }).strict() });
export type RentalSnapshot = z.infer<typeof rentalSnapshotSchema> | z.infer<typeof rentalSnapshotV2Schema>;

// JSONB does not preserve object-key order. Hash canonical JSON, never raw DB serialization.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function rentalSnapshotHash(snapshot: RentalSnapshot) {
  return createHash("sha256").update(canonical(snapshot)).digest("hex");
}
export function readRentalSnapshot(value: unknown, hash: string, schemaVersion: number, templateVersion: number) {
  if (!((schemaVersion === 1 && templateVersion === 1) || (schemaVersion === 2 && templateVersion === 2))) throw new Error("Версия шаблона документа не поддерживается.");
  const parsed = (schemaVersion === 2 ? rentalSnapshotV2Schema : rentalSnapshotSchema).safeParse(value);
  if (!parsed.success || rentalSnapshotHash(parsed.data) !== hash) throw new Error("Не удалось проверить сохранённый документ.");
  return parsed.data;
}
