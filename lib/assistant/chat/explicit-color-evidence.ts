import { normalizeRequestedColor } from "../colors";

// A deliberately narrow user-language command, not extraction from model prose.
// Everything else still needs the normal preference review. No exclusions,
// questions, conditionals, multiple colours or other garment slots are inferred.
export function explicitColorCorrection(message: string, activeSlot = "dress"): string | null {
  if (activeSlot !== "dress" && /платье/iu.test(message)) return null;
  const direct = message.trim().match(/^(?:А ([\p{L}]+) на те же даты есть\?|Теперь подбери ([\p{L}]+), параметры прежние[.!]?|Размер \d{2,3} и ([\p{L}]+) платье, даты прежние[.!]?)$/iu);
  if (direct) { try { return normalizeRequestedColor(direct[1] ?? direct[2] ?? direct[3]); } catch { return null; } }
  const match = message.trim().match(/^(?:лучше|теперь|тогда|хочу)\s+([\p{L}]+)(?:\s+(?:цвет|платье))?(?:[.,]\s*|$)(.*)$/iu);
  if (!match) return null;
  const rest = match[2].trim();
  if (rest && !/^(?:остальные пожелания и даты те же|размер и даты оставь|подбери на те же даты)(?:[.]\s*(?:Есть вариант дешевле первого\?)?)?[.]?$/iu.test(rest)) return null;
  try { return normalizeRequestedColor(match[1]); } catch { return null; }
}

export function explicitCombinedSize(message: string, activeSlot: string): string | null {
  if (activeSlot !== "dress" || !explicitColorCorrection(message, activeSlot)) return null;
  return message.trim().match(/^Размер (\d{2,3}) и [\p{L}]+ платье, даты прежние[.!]?$/iu)?.[1] ?? null;
}
