import {z} from "zod";
const money=z.coerce.bigint().refine(v=>v>=BigInt(0),"Сумма не может быть отрицательной.");
export const orderSources=["CRM","PHONE","WHATSAPP","INSTAGRAM","WEBSITE","OTHER"] as const;
export const orderSchema=z.object({branchId:z.string().uuid(),customerId:z.string().uuid(),source:z.enum(orderSources),rentalStart:z.coerce.date(),rentalEnd:z.coerce.date(),discountMinor:money.default(BigInt(0)),internalComment:z.string().trim().max(4000).nullable().optional()}).refine(v=>v.rentalEnd>v.rentalStart,{message:"Дата окончания должна быть позже даты начала.",path:["rentalEnd"]});
export const orderItemSchema=z.object({productVariantId:z.string().uuid(),quantity:z.coerce.number().int().min(1).max(1000),unitPriceMinor:money.optional(),discountMinor:money.default(BigInt(0)),adjustmentReason:z.string().trim().max(500).nullable().optional()});
export const cancellationSchema=z.string().trim().min(3,"Укажите причину отмены.").max(500);
