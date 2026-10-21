import { z } from 'zod';
import { branchCivilDay, rentalPeriod, returnDate } from '@/lib/showroom/period';
import { parseBusinessLocalDateTime } from '@/lib/calendar/timezone';
import type { OutfitContext } from './outfit-contracts';

// Model-selected intent; this module computes dates and validates quoted evidence.
// It never selects a conversational reply or reads/writes CRM.
export const calendarRequestSchema = z.object({
  start: z.object({ kind: z.enum(['relative', 'weekday', 'absolute']), value: z.string().max(24), quote: z.string().min(1).max(160) }).strict().nullable(),
  days: z.number().int().min(1).max(31).nullable(),
  durationQuote: z.string().min(1).max(160).nullable(),
}).strict();
export function serverClock(timezone: string | undefined, now = Date.now()) {
  return { nowUtc: new Date(now).toISOString(), timezone: timezone ?? null,
    localDate: timezone ? branchCivilDay(timezone, now) : null,
    localTime: timezone ? new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now)) : null };
}
const weekdays = ['воскресень', 'понедельник', 'вторник', 'сред', 'четверг', 'пятниц', 'суббот'];
export function calendarFailureReason(error: unknown) {
  const reasons: Record<string,string> = {
    'branch required':'branch_required', 'pickup date required':'pickup_required',
    'relative date evidence missing':'relative_evidence', 'duration evidence missing':'duration_evidence',
    'duration value not supported':'duration_value', 'ambiguous date evidence':'ambiguous_date',
    'date quote is not a complete token':'partial_token', 'negated date evidence':'negated_date',
    'alternative dates need clarification':'alternative_dates', 'qualified weekday needs clarification':'qualified_weekday',
    'weekday evidence missing':'weekday_evidence', 'absolute date evidence missing':'absolute_evidence',
    'negated duration evidence':'negated_duration',
  };
  return error instanceof Error ? reasons[error.message] ?? 'period_invalid' : 'period_invalid';
}
export function resolveRentalRequest(raw: unknown, current: OutfitContext, latest: string, branch: { id: string; timezone: string } | undefined, now = Date.now()) {
  const request = calendarRequestSchema.parse(raw);
  if (!branch) throw new Error('branch required');
  const next = structuredClone(current), today = branchCivilDay(branch.timezone, now);
  let day = next.pendingRentalStart?.branchId === branch.id && next.pendingRentalStart.timezone === branch.timezone ? next.pendingRentalStart.fromDay : next.from?.slice(0, 10);
  let rolledPastPickupWindow = false;
  if (request.start) {
    const { kind, value, quote } = request.start;
    if (!latest.includes(quote) || /(?:не|или|может|наверн)\s/iu.test(quote)) throw new Error('ambiguous date evidence');
    const text = quote.toLowerCase().replaceAll('ё', 'е');
    // Prevent a model from quoting only the positive fragment of a negation.
    const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'iu').test(latest)) throw new Error('date quote is not a complete token');
    if (new RegExp('(?:не|кроме)\\s+(?:на\\s+)?' + escaped, 'iu').test(latest)) throw new Error('negated date evidence');
    if (/(?:сегодня|завтра|послезавтра|понедельник\p{L}*|вторник\p{L}*|сред\p{L}*|четверг\p{L}*|пятниц\p{L}*|суббот\p{L}*|воскресень\p{L}*)\s+или\s/iu.test(latest)) throw new Error('alternative dates need clarification');
    if (kind === 'relative') {
      const offsets: Record<string, number> = { today: 0, tomorrow: 1, day_after_tomorrow: 2 };
      const tokens: Record<string, string> = { today: 'сегодня', tomorrow: 'завтра', day_after_tomorrow: 'послезавтра' };
      // Quoted evidence may include the ordinary preposition; the semantic token
      // must still match exactly, with the existing negation/alternative guards.
      const relativeToken = text.trim().replace(/^на\s+/u, '');
      if (!(value in offsets) || relativeToken !== tokens[value]) throw new Error('relative date evidence missing');
      day = offsets[value] ? returnDate(today, offsets[value]) : today;
    } else if (kind === 'weekday') {
      if (/следующ|через\s+недел|не\s+эту/iu.test(latest)) throw new Error('qualified weekday needs clarification');
      const weekday = Number(value);
      if (!/^[0-6]$/.test(value) || !text.includes(weekdays[weekday])) throw new Error('weekday evidence missing');
      let offset = (weekday - new Date(today + 'T12:00:00Z').getUTCDay() + 7) % 7;
      if (!offset && now >= parseBusinessLocalDateTime(today + 'T20:00', branch.timezone).getTime()) { offset = 7; rolledPastPickupWindow = true; }
      day = offset ? returnDate(today, offset) : today;
    } else {
      const normalized = /^\d{2}[./]\d{2}[./]\d{4}$/.test(text) ? text.split(/[./]/).reverse().join('-') : text;
      if (value !== normalized || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('absolute date evidence missing');
      day = value;
    }
    // Validate pickup even while duration is unknown; this is NOT a default rental.
    rentalPeriod(day!, returnDate(day!, 1), branch.timezone, now);
    next.from = null; next.until = null;
    next.pendingRentalStart = { fromDay: day!, branchId: branch.id, timezone: branch.timezone };
  }
  if (!day) throw new Error('pickup date required');
  if (request.days !== null) {
    const quote = request.durationQuote;
    if (!quote || !latest.includes(quote) || /(?:не|или|может|наверн)\s/iu.test(quote)) throw new Error('duration evidence missing');
    const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('(?:не|кроме)\\s+(?:на\\s+)?' + escaped, 'iu').test(latest)) throw new Error('negated duration evidence');
    const normalized = quote.toLowerCase().replace(/один|одну/gu, '1').replace(/два|двое/gu, '2').replace(/три/gu, '3');
    const match = normalized.match(/(?:на\s+)?(\d{1,2})\s*(?:день|дня|дней|сутк|суток)/u);
    const days = match ? Number(match[1]) : /^(?:на\s+)?(?:день|сутки)$/u.test(normalized.trim()) ? 1 : null;
    if (days !== request.days) throw new Error('duration value not supported');
    const period = rentalPeriod(day, returnDate(day, request.days), branch.timezone, now);
    next.from = period.fromLocal; next.until = period.untilLocal; delete next.pendingRentalStart;
  }
  delete next.nextSearch; delete next.recentCards; delete next.dateDraft; next.calendarPeriod = false;
  return { context: next, result: { status: next.until ? 'complete' : 'duration_required', fromDay: day, from: next.from, until: next.until, timezone: branch.timezone, rolledPastPickupWindow, availabilityChecked: false } };
}
