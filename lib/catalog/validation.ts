import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  internalCode: z.string().trim().min(1).max(80),
  supplierModel: optionalText(120),
  description: optionalText(4000),
  brand: optionalText(120),
  categoryId: z.string().uuid().nullable(),
  color: optionalText(120),
  isRentable: z.boolean(),
  isSellable: z.boolean(),
  trackingMode: z.enum(["SERIALIZED", "BULK"]).default("BULK"),
  publicationStatus: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  turnaroundBufferMinutes: z.number().int().min(0).max(10080).nullable()
}).refine((value) => value.isRentable || value.isSellable, {
  message: "Товар должен быть доступен для аренды или продажи."
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(-100000).max(100000),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"])
});

export const sizeInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  sizeSystem: z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : "LEGACY", z.string().max(80)),
  recommendedHeightCm: z.number().int().positive().max(300).nullable().optional().default(null),
  lengthCm: z.number().int().positive().max(1000).nullable().optional().default(null),
  sortOrder: z.number().int().min(-100000).max(100000),
  isActive: z.boolean()
});

export const variantInputSchema = z.object({
  productId: z.string().uuid(),
  sizeId: z.string().uuid(),
  executionId: z.string().uuid().nullable().optional().default(null),
  sku: z.string().trim().max(100).optional().default("")
});

export const executionInputSchema = z.object({
  productId: z.string().uuid(),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(-100000).max(100000).default(0),
  isActive: z.boolean().default(true),
});
