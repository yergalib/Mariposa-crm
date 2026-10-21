// Compatibility with existing WEBSITE inquiries; no new schema or authorization.
// These prefixes are written by the showroom service, before any client free text.
export function isPurchaseInquiry(value: { source?: string | null; subject?: string | null; requestText?: string | null }) {
  return value.source === 'WEBSITE' && (value.subject?.startsWith('Заявка на покупку с сайта') === true || value.requestText?.startsWith('Тип: ПОКУПКА (SALE).') === true);
}
