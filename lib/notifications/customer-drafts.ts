import { z } from "zod";

const text = z.string().trim().min(1).max(150).refine(value => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069{}]/u.test(value), "Недопустимые управляющие символы или скобки.");
const iso = z.string().datetime({ offset: true });
export const customerDraftFactsSchema = z.object({
  orderReference: text,
  branchName: text,
  timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("ru-RU", { timeZone: value }); return true; } catch { return false; } }, "Неизвестный часовой пояс."),
  rentalStartAt: iso.optional(),
  plannedReturnAt: iso.optional(),
  issuedQuantity: z.number().int().min(0).max(2147483647).optional(),
  remainingQuantity: z.number().int().min(0).max(2147483647).optional(),
}).strict();
export type CustomerDraftFacts = z.input<typeof customerDraftFactsSchema>;

export const CUSTOMER_DRAFT_TEMPLATES = {
  RENTAL_PERIOD: "Заказ {{orderReference}}, филиал {{branchName}}. Плановый период аренды: с {{rentalStart}} до {{plannedReturn}}. Пожалуйста, проверьте время с сотрудником.",
  PLANNED_RETURN: "Напоминание по заказу {{orderReference}}: плановый возврат {{plannedReturn}}, филиал {{branchName}}. Если планы изменились, пожалуйста, сообщите сотруднику.",
  SALE_HANDOVER: "По заказу {{orderReference}} в филиале {{branchName}} зафиксирована передача: {{issuedQuantity}} шт. Осталось передать: {{remainingQuantity}} шт. Пожалуйста, проверьте сведения с сотрудником.",
} as const;
export type CustomerDraftKind = keyof typeof CUSTOMER_DRAFT_TEMPLATES;
const placeholders = ["orderReference", "branchName", "rentalStart", "plannedReturn", "issuedQuantity", "remainingQuantity"] as const;

// Plain text only. No DB, recipient lookup, channel API, HTML, eval or transport.
// Template text is a proposal for review, never an approved/sent message.
export function renderCustomerDraft(template: string, raw: CustomerDraftFacts) {
  const facts = customerDraftFactsSchema.parse(raw);
  if (!template.trim() || template.length > 1200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(template)) throw Error("Проверьте текст черновика.");
  if (facts.rentalStartAt && facts.plannedReturnAt && new Date(facts.rentalStartAt) >= new Date(facts.plannedReturnAt)) throw Error("Плановый возврат должен быть позже начала аренды.");
  const date = (value: string | undefined) => value === undefined ? undefined : new Intl.DateTimeFormat("ru-RU", { timeZone: facts.timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  const values: Record<typeof placeholders[number], string | undefined> = {
    orderReference: facts.orderReference, branchName: facts.branchName,
    rentalStart: date(facts.rentalStartAt), plannedReturn: date(facts.plannedReturnAt),
    issuedQuantity: facts.issuedQuantity?.toString(), remainingQuantity: facts.remainingQuantity?.toString(),
  };
  const residual = template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_token, key: string) => {
    if (!placeholders.includes(key as typeof placeholders[number])) throw Error("Неизвестная переменная шаблона.");
    if (values[key as typeof placeholders[number]] === undefined) throw Error("Для черновика не хватает фактов CRM.");
    return "";
  });
  if (/[{}]/u.test(residual)) throw Error("Неверный синтаксис переменной шаблона.");
  const rendered = template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_token, key: string) => values[key as typeof placeholders[number]]!);
  if (rendered.length > 2000) throw Error("Черновик слишком длинный.");
  return Object.freeze({ text: rendered, status: "DRAFT_REQUIRES_REVIEW" as const, deliveryEnabled: false as const });
}

export function prepareCustomerDraft(kind: CustomerDraftKind, facts: CustomerDraftFacts) {
  if (!Object.hasOwn(CUSTOMER_DRAFT_TEMPLATES, kind)) throw Error("Неизвестный тип черновика.");
  return renderCustomerDraft(CUSTOMER_DRAFT_TEMPLATES[kind], facts);
}
