import type { OutfitContext } from './outfit-contracts';
import { outfitContextSchema } from './outfit-contracts';
import { applyRelativePeriod } from './relative-period';

export type RecoveryReason = 'missing_information' | 'invalid_model_response' | 'preference_not_confirmed' | 'review_unavailable' | 'prose_not_confirmed' | 'tool_timeout' | 'tool_unavailable';

// Independent literal evidence only. A rejected model patch is never partially trusted.
// Ambiguity/negation disables this narrow salvage, rather than cherry-picking a quote.
export function recoverExplicitPreferences(original: OutfitContext, latest: string, branch?: { id: string; timezone: string }) {
  const next = structuredClone(original);
  if (/\?|(?:^|\s)(?:не|нет|или|кроме|без)\s|может|наверн/iu.test(latest)) return next;
  applyRelativePeriod(next, latest, '', branch);
  const parts = latest.split(/[;,]/u).map(p => p.trim());
  // A free-form clause can negate or qualify an earlier label. Without a semantic
  // verdict retain only a whole utterance made of simple labelled preferences.
  if (!parts.every(p => /^(?:(?:размер|рост)\s*[:—-]?\s*\d{2,3}(?:\s*см)?|цвет\s+[\p{L}]+)[.!]?$/iu.test(p))) return outfitContextSchema.parse(next);
  const sizes = parts.flatMap(p => /^(?:размер)\s*[:—-]?\s*(\d{2,3})[.!]?$/iu.exec(p)?.[1] ?? []);
  if (new Set(sizes).size === 1 && !/обув|туфл|плать|аксессуар/iu.test(latest)) next.criteria[next.activeSlot].size = sizes[0];
  const heights = parts.flatMap(p => /^рост\s*[:—-]?\s*(\d{2,3})(?:\s*см)?[.!]?$/iu.exec(p)?.[1] ?? []);
  if (new Set(heights).size === 1 && +heights[0] >= 40 && +heights[0] <= 220) next.heightCm = +heights[0];
  if (JSON.stringify(next.criteria) !== JSON.stringify(original.criteria) || next.from !== original.from || next.until !== original.until) {
    delete next.nextSearch; delete next.recentCards;
  }
  return outfitContextSchema.parse(next);
}

export function recoveryMessage(reason: RecoveryReason, context: OutfitContext, branchId?: string) {
  if (reason === 'prose_not_confirmed') return 'Текст ответа не прошёл проверку. Подтверждённые пожелания сохранены; непроверенные рекомендации не показываю.';
  if (reason === 'tool_timeout') return 'Проверка каталога не завершилась вовремя. Наличие неизвестно; повторного запроса не отправляла. Сохранённые пожелания не потеряны.';
  if (reason === 'tool_unavailable') return 'Не удалось прочитать каталог. Наличие сейчас неизвестно; это не означает, что подходящих вещей нет. Сохранённые пожелания не потеряны.';
  if (reason === 'invalid_model_response') return 'Не удалось обработать ответ помощника. Сохранённые пожелания не потеряны; новый запрос автоматически не отправлен.';
  if (reason === 'review_unavailable') return 'Проверка ответа помощника сейчас недоступна. Сохранённые пожелания не потеряны; непроверенные рекомендации не показываю.';
  if (reason === 'preference_not_confirmed') return 'Не смогла однозначно применить всё уточнение. Сохранила только явно подтверждённые параметры; какое пожелание нужно изменить?';
  if (!branchId) return 'В каком филиале хотите получить наряд?';

  if (!context.from || !context.until) return !context.from && !context.until ? 'На какую дату и на сколько дней нужен наряд?' : !context.from ? 'Когда заберёте наряд: дата?' : 'Когда вернёте наряд: дата?';
  if (context.activeSlot !== 'accessory' && !context.criteria[context.activeSlot].size) return 'Какой размер указан на бирке подходящей вещи? Рост сам по себе не гарантирует размер.';
  if (context.criteria[context.activeSlot].color === null) return 'Какой цвет предпочитаете, или подойдёт любой?';
  return 'Какую категорию вещей подобрать?';
}
