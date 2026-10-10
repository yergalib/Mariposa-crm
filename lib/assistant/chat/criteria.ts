import type { PublicBranch } from "@/lib/showroom/contracts";
import { normalizeRequestedColor } from "@/lib/assistant/colors";
import type { ChatInput } from "./contracts";

export type Criteria = { size: string | null; color: string | null; branchId: string | null; from: string | null; until: string | null };
const normalize = (text: string) => text.toLowerCase().replaceAll("ё", "е");
const dates = /(?:\d{4}[-.]\d{2}[-.]\d{2}|\d{2}[./]\d{2}[./]\d{4})/g;
export function localDateTime(text: string): string | null {
  const date = text.match(dates)?.[0];
  if (!date) return null;
  const parts = date.split(/[-./]/).map(Number);
  const [year, month, day] = parts[0] > 999 ? parts : [parts[2], parts[1], parts[0]];
  const rest = normalize(text.slice(text.indexOf(date) + date.length));
  const time = rest.match(/(?:^|[\sтtв])([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\s*(утра|дня|вечера|ночи)?/u);
  if (!time || (!time[2] && !time[3])) return null;
  let hour = Number(time[1]);
  if ((time[3] === "вечера" || time[3] === "дня") && hour < 12) hour += 12;
  if (time[3] === "ночи" && hour === 12) hour = 0;
  const minute = Number(time[2] ?? 0), calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  // Keep local wall time. CRM converts using branch.timezone, never host timezone.
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
export function replayCriteria(messages: ChatInput["messages"], branches: PublicBranch[], selectedBranch?: string): Criteria {
  const state: Criteria = { size: null, color: null, branchId: selectedBranch ?? (branches.length === 1 ? branches[0].id : null), from: null, until: null };
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const text = normalize(message.content);
    const size = text.match(/(?:размер\s*[:—-]?\s*(\d{2,3})|(\d{2,3})\s*(?:см\s*)?размер)/u);
    if (size) state.size = size[1] ?? size[2];
    else if (/^\d{2,3}$/.test(text.trim()) && /размер/u.test(messages[index - 1]?.content ?? "")) state.size = text.trim();
    const colors = [...new Set((text.match(/[\p{L}]+/gu) ?? []).flatMap(word => {
      try { const color = normalizeRequestedColor(word); return color ? [color] : []; } catch { return []; }
    }))];
    if (/любой\s+цвет|цвет\s+не\s+важен/u.test(text)) state.color = "";
    else if (colors.length) state.color = colors.length === 1 && !/(?:^|\s)(?:не|кроме|без)\s/u.test(text) ? colors[0] : null;
    if (!colors.length && mentionsColorRequest(text) && !/любой\s+цвет|цвет\s+не\s+важен/u.test(text)) state.color = null;
    if (!selectedBranch) {
      const matched = branches.filter(branch => [branch.name, branch.city].some(label => label && text.includes(normalize(label))));
      if (matched.length === 1) state.branchId = matched[0].id;
    }
    const found = [...text.matchAll(dates)];
    if (found.length === 2) {
      state.from = localDateTime(text.slice(found[0].index!, found[1].index!));
      state.until = localDateTime(text.slice(found[1].index!));
    } else if (found.length === 1) {
      const value = localDateTime(text.slice(found[0].index!));
      if (/возврат|верну|принесу|сдам/u.test(text)) state.until = value;
      else if (/получ|заберу|начал/u.test(text)) state.from = value;
      else if (!state.from) state.from = value;
      else if (!state.until) state.until = value;
    }
  }
  return state;
}

// A correction must not silently fall back to an earlier colour after negation/ambiguity.
export function mentionsColorRequest(text: string) { return /цвет|желт|жёлт|розов|бел|черн|чёрн|син|голуб|красн|молоч|айвори|шампан|беж|зел[её]н|фиолет|золот|сереб|оранж|корич|серый|серая|бордо|тиффани/iu.test(text); }
