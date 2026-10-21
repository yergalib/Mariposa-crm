import { branchCivilDay, rentalPeriod } from '@/lib/showroom/period';
import { explicitSizeEvidence } from './explicit-size-evidence';
import type { OutfitContext } from './outfit-contracts';

// Civil dates are resolved once in the selected branch, never in the browser/host zone.
// A day preference is not an availability interval: hours must come from the user.
export function applyRelativePeriod(context: OutfitContext, latest: string, previous: string,
  branch: { id: string; timezone: string } | undefined, now = Date.now()) {
  if (!branch) return null;
  const text = latest.toLowerCase().replaceAll('ё', 'е');
  if (/\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4}/u.test(text)) {
    delete context.dateDraft; return null; // Explicit replacement uses the normal evidence validator.
  }
  const relative = /(?<![а-я])завтра(?![а-я])/u.test(text);
  const duration = text.match(/на\s+(1|один)\s+день(?![а-я])/u);
  if (relative && duration && !/\?|(?:^|\s)(?:нет|не|кроме|без)\s|может|наверн|послезавтра/iu.test(text)) {
    const today = branchCivilDay(branch.timezone, now);
    const day = (offset: number) => new Date(Date.parse(today + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
    context.dateDraft = { fromDay: day(1), untilDay: day(2), branchId: branch.id, timezone: branch.timezone };
    context.from = null; context.until = null; context.calendarPeriod = false;
    delete context.nextSearch;
  } else if (!context.dateDraft || relative) return null;
  const draft = context.dateDraft;
  if (!draft || draft.branchId !== branch.id || draft.timezone !== branch.timezone || context.calendarPeriod) return null;
  if (/^(?:любой цвет|цвет не важен)[.!]?$/iu.test(text.trim())) context.criteria[context.activeSlot].color = '';
  const size = latest.match(/размер\s*[:—-]?\s*(\d{2,3})(?!\d)/iu)?.[1];
  if (size && explicitSizeEvidence(size, latest, previous, context.activeSlot, context.activeSlot)) context.criteria[context.activeSlot].size = size;
  const height = text.match(/(?:^|[.!;,]\s*|\s)рост\s*[:—-]?\s*(\d{2,3})(?!\d)/u)?.[1];
  if (height && Number(height) >= 40 && Number(height) <= 220 && !/\?|(?:^|\s)(?:не|может|наверное)\s/iu.test(text)) context.heightCm = Number(height);
  // Require separate labelled clock times; never invent a return hour from a duration.
  const pickup = text.match(/(?:заберу|получение|получу)\s*(?:в\s*)?([01]?\d|2[0-3]):([0-5]\d)(?!\d)/u);
  const dropoff = text.match(/(?:верну|возврат|сдам)\s*(?:в\s*)?([01]?\d|2[0-3]):([0-5]\d)(?!\d)/u);
  if (!/\?|(?:^|\s)(?:не|может|наверное)\s/iu.test(text)) {
    if (pickup) context.from = `${draft.fromDay}T${pickup[1].padStart(2, '0')}:${pickup[2]}`;
    if (dropoff) context.until = `${draft.untilDay}T${dropoff[1].padStart(2, '0')}:${dropoff[2]}`;
  }
  const label = `${draft.fromDay.split('-').reverse().join('.')} — ${draft.untilDay.split('-').reverse().join('.')}`;
  if (context.from && context.until) {
    try { rentalPeriod(context.from, context.until, branch.timezone, now); }
    catch { context.from = null; context.until = null; return { message: 'Уточните будущее время получения и возврата: возврат должен быть позже получения.', complete: false }; }
    delete context.dateDraft;
    return { message: '', complete: true };
  }
  return { message: `Для аренды на один день: ${label}, по местному времени филиала. ${!context.from && !context.until ? 'Во сколько заберёте и во сколько вернёте платье?' : !context.from ? 'Во сколько заберёте платье?' : 'Во сколько вернёте платье?'} Например: «заберу в 11:00, верну в 18:00».`, complete: false };
}
