import { z } from "zod";
import { CUSTOMER_DRAFT_TEMPLATES, renderCustomerDraft } from "@/lib/notifications/customer-drafts";

export const templateKindSchema = z.enum(["RENTAL_NOTE", "RENTAL_PERIOD", "PLANNED_RETURN", "SALE_HANDOVER"]);
export type TemplateKind = z.infer<typeof templateKindSchema>;
export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  RENTAL_NOTE: "Информационный текст документа аренды",
  RENTAL_PERIOD: "Клиентский черновик: период аренды",
  PLANNED_RETURN: "Клиентский черновик: плановый возврат",
  SALE_HANDOVER: "Клиентский черновик: передача продажи",
};
export const TEMPLATE_VARIABLES: Record<TemplateKind, readonly string[]> = {
  RENTAL_NOTE: ["orderReference", "branchName"],
  RENTAL_PERIOD: ["orderReference", "branchName", "rentalStart", "plannedReturn"],
  PLANNED_RETURN: ["orderReference", "branchName", "plannedReturn"],
  SALE_HANDOVER: ["orderReference", "branchName", "issuedQuantity", "remainingQuantity"],
};
export const TEMPLATE_DEFAULTS: Record<TemplateKind, string> = {
  RENTAL_NOTE: "",
  ...CUSTOMER_DRAFT_TEMPLATES,
};
export const TEMPLATE_PREVIEW_FACTS = {
  orderReference: "ОБРАЗЕЦ-103", branchName: "Тестовый филиал", timezone: "Asia/Almaty",
  rentalStartAt: "2026-10-08T05:00:00Z", plannedReturnAt: "2026-10-09T05:00:00Z",
  issuedQuantity: 3, remainingQuantity: 4,
} as const;

export function validateTemplateBody(kind: TemplateKind, body: string) {
  for (const match of body.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)) {
    if (!TEMPLATE_VARIABLES[kind].includes(match[1])) throw Error("Переменная недоступна для этого вида текста.");
  }
  return renderCustomerDraft(body, TEMPLATE_PREVIEW_FACTS).text;
}
