// Conservative vocabulary, not free-text AI inference. Yellow is not gold; white is not milk.
const endings = "(?:ый|ая|ое|ые|ого|ой|ому|ую|ых|ым|ыми|ом)";
const definitions = [
  ["Жёлтый", new RegExp("^желт" + endings + "$"), "yellow"],
  ["Розовый", new RegExp("^розов" + endings + "$"), "pink"],
  ["Белый", new RegExp("^бел" + endings + "$"), "white"],
  ["Молочный", new RegExp("^молочн" + endings + "$"), "milk"],
  ["Чёрный", new RegExp("^черн" + endings + "$"), "black"],
  ["Красный", new RegExp("^красн" + endings + "$"), "red"],
  ["Зелёный", new RegExp("^зелен" + endings + "$"), "green"],
  ["Голубой", /^(?:голубой|голубая|голубое|голубые|голубого|голубую|голубых|голубым|голубыми|голубом|голубому)$/, "lightblue"],
  ["Синий", /^син(?:ий|яя|ее|ие|его|ей|ему|юю|их|им|ими|ем)$/, "blue"],
  ["Фиолетовый", new RegExp("^фиолетов" + endings + "$"), "purple"],
  ["Бежевый", new RegExp("^бежев" + endings + "$"), "beige"],
  ["Серый", new RegExp("^сер" + endings + "$"), "grey"],
  ["Оранжевый", new RegExp("^оранжев" + endings + "$"), "orange"],
  ["Коричневый", new RegExp("^коричнев" + endings + "$"), "brown"],
  ["Золотой", /^(?:золотой|золотая|золотое|золотые|золотого|золотую|золотых|золотым|золотыми|золотом|золотому)$/, "gold"],
  ["Серебристый", new RegExp("^серебрист" + endings + "$"), "silver"],
  ["Шампань", /^шампань$/, "champagne"], ["Айвори", /^айвори$/, "ivory"]
] as const;
export const supportedColors = definitions.map(([label]) => label);
const words = (value: string) => value.normalize("NFKC").toLowerCase().replaceAll("ё", "е").match(/[\p{L}\p{N}]+/gu) ?? [];
const colorOf = (word: string) => definitions.find(([, pattern, english]) => pattern.test(word) || english === word)?.[0];
const mentions = (text: string) => [...new Set(words(text).flatMap(word => colorOf(word) ? [colorOf(word)!] : []))];
const negation = (text: string) => words(text).some(word => ["не", "без", "кроме", "исключить", "никакой"].includes(word));
export function normalizeRequestedColor(value: string): string | null {
  const tokens = words(value);
  if (!value.trim() || tokens.join(" ") === "любой" || tokens.join(" ") === "любой цвет") return null;
  const colors = mentions(value);
  if (colors.length !== 1 || tokens.some(word => !colorOf(word) && !["цвет", "цвета", "цвете"].includes(word)))
    throw new Error("Не удалось однозначно распознать цвет. Укажите один цвет отдельно, например «жёлтый», или «любой». Оттенки и исключения уточните у сотрудника.");
  return colors[0];
}
export function resolveColorRequest(color: string, search: string, wishes = "") {
  const uncertainColor = /^(бордов|бирюзов|сиренев|лилов|коралл|персиков|пудров|фукси|канарееч|лимонн|изумрудн|оливков|мятн|малинов|салатов)/;
  if ([...words(search), ...words(wishes)].some(word => uncertainColor.test(word)))
    throw new Error("В тексте указан оттенок, который подбор пока не умеет подтверждать. Уточните один поддерживаемый цвет в поле и измените текст; точный оттенок проверит сотрудник.");
  const explicit = normalizeRequestedColor(color), searchColors = mentions(search), wishColors = mentions(wishes);
  const all = [...new Set([...searchColors, ...wishColors, ...(explicit ? [explicit] : [])])];
  if (all.length > 1 || (searchColors.length && negation(search)) || (wishColors.length && negation(wishes)))
    throw new Error("Цвет в пожеланиях или названии неоднозначен либо отличается от отдельного поля. Уточните один цвет и уберите противоречие перед подбором.");
  if (color.trim() && !explicit && all.length)
    throw new Error("В тексте указан цвет, а в поле выбран «любой». Уточните цвет в поле или измените пожелание.");
  const appliedColor = explicit ?? all[0] ?? null;
  // Extract supported colour words from model search, preserving the other terms.
  const modelSearch = searchColors.length ? search.replace(/[\p{L}\p{N}]+/gu, word => {
    const normalized = words(word)[0] ?? ""; return colorOf(normalized) || ["цвет", "цвета", "цвете"].includes(normalized) ? "" : word;
  }).replace(/\s+/g, " ").trim() : search;
  return { color: appliedColor ?? "", search: modelSearch };
}
function descriptorColors(value: string | null): string[] {
  if (!value) return [];
  const tokens = words(value);
  const allowed = ["и", "с", "цвет", "цвета", "велюр", "шелк", "атлас", "фатин", "бархат"];
  // Unknown descriptors or negation are not evidence of colour.
  if (tokens.some(word => !colorOf(word) && !allowed.includes(word))) return [];
  return mentions(value);
}
export function confirmedColorMatches(color: string, execution: string | null, productColor: string | null) {
  const canonical = normalizeRequestedColor(color);
  if (!canonical) return true;
  const evidence = execution?.trim() ? descriptorColors(execution) : descriptorColors(productColor);
  return evidence.includes(canonical);
}
export function broadenColor<T extends { color?: string }>(criteria: T): T {
  return { ...criteria, color: "" };
}
