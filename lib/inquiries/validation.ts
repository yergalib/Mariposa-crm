import { z } from "zod";

export const SOURCE_LABELS = { CRM: "В магазине", WEBSITE: "Сайт", TELEGRAM: "Telegram", WHATSAPP: "WhatsApp", PHONE: "Телефон", OTHER: "Другое" } as const;
export const STATUS_LABELS = { NEW: "Новое", IN_PROGRESS: "В работе", WAITING_CUSTOMER: "Ожидаем клиента", CLOSED: "Закрыто" } as const;
export const sourceSchema = z.enum(["CRM", "WEBSITE", "TELEGRAM", "WHATSAPP", "PHONE", "OTHER"]);
export const statusSchema = z.enum(["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "CLOSED"]);
const localDate = z.string().max(30).refine(value => value === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value), "Проверьте дату и время.");
export const inquiryFields = z.object({
  subject: z.string().trim().min(1).max(200), customerLabel: z.string().trim().max(120),
  requestText: z.string().trim().max(2000), requestedSize: z.string().trim().max(100),
  requestedFrom: localDate, requestedUntil: localDate,
  nextAction: z.string().trim().max(500), nextActionAt: localDate,
  assignedMembershipId: z.union([z.literal(""), z.string().uuid()])
});
export const createInquiryInput = inquiryFields.extend({
  branchId: z.string().uuid(), source: sourceSchema, creationKey: z.string().uuid(),
  variantIds: z.array(z.string().uuid()).max(20).transform(ids => [...new Set(ids)].sort())
});
export const updateInquiryInput = inquiryFields.extend({
  id: z.string().uuid(), version: z.number().int().positive(), status: statusSchema
});
export type InquiryFields = z.infer<typeof inquiryFields>;
