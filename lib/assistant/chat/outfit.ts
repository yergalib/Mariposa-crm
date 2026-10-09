import { branchLabel } from "@/lib/showroom/categories";
import "server-only";
import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";
import { chatInput, hasSensitiveText, type ChatReply, type ChatCard } from "./contracts";
import { emptyOutfit, type OutfitSlot } from "./outfit-contracts";
import { replayCriteria, mentionsColorRequest } from "./criteria";
import { runConversation } from "./engine";
import { AssistantError, CHAT_LIMITS, untilAborted } from "./limits";
import type { ChatProvider } from "./provider";
import type { CrmToolRunner, SearchToolResult } from "./tools";

export function categorySlot(name: string): OutfitSlot | null {
  if (/^платья(?:\s|>|$)/iu.test(name)) return "dress";
  if (/^обувь(?:\s|>|$)/iu.test(name)) return "shoes";
  if (/^(аксессуары|колготки и гольфы)(?:\s|>|$)/iu.test(name)) return "accessory";
  return null;
}
const slotLabel = { dress: "платье", shoes: "обувь", accessory: "аксессуар" };
export async function runOutfitConversation(raw: unknown, provider: ChatProvider, tools: CrmToolRunner, signal: AbortSignal): Promise<ChatReply> {
  const parsed = chatInput.safeParse(raw);
  if (!parsed.success) throw new AssistantError("Проверьте сообщение и выбранные товары.");
  const input = parsed.data, messages = input.messages, latest = messages.at(-1)!.content;
  if (Buffer.byteLength(JSON.stringify(messages), "utf8") > CHAT_LIMITS.historyBytes || Buffer.byteLength(JSON.stringify(input), "utf8") > 12000) throw new AssistantError("Сообщение слишком длинное.", 413);
  if (messages.some(message => hasSensitiveText(message.content))) throw new AssistantError("Используйте вымышленный запрос без контактов и личных данных.");
  const context = input.context ? structuredClone(input.context) : emptyOutfit();
  const nextSearch = input.action?.type === "more" ? context.nextSearch : undefined;
  delete context.nextSearch;
  const height = latest.match(/рост\s*[:—-]?\s*(\d{2,3})/iu);
  if (height && Number(height[1]) >= 40 && Number(height[1]) <= 220) context.heightCm = Number(height[1]);
  const branchId = input.branchId ?? (tools.branches.length === 1 ? tools.branches[0].id : undefined);
  if (!input.context) {
    const previousPeriod = replayCriteria(messages, tools.branches, branchId);
    context.from = previousPeriod.from; context.until = previousPeriod.until;
  }
  if (branchId && !tools.branches.some(branch => branch.id === branchId)) throw new AssistantError("Выберите доступный филиал.", 403);
  const outfit: Partial<Record<OutfitSlot, ChatCard>> = {};
  const slotCategories = (slot: OutfitSlot) => tools.categories.filter(category => categorySlot(category.name) === slot);
  for (const slot of ["dress", "shoes", "accessory"] as const) {
    const categoryId = context.criteria[slot].categoryId;
    if (categoryId && !slotCategories(slot).some(category => category.id === categoryId)) throw new AssistantError("Категория больше недоступна.", 404);
  }
  let slot = context.activeSlot, prefix = "";
  const text = latest.toLowerCase().replaceAll("ё", "е");
  const mentioned: OutfitSlot | null = /обув|туфл|балетк|чешк/u.test(text) ? "shoes" : /аксессуар|украшен|бижутер|ободок|волос|голов|сумк|перчат|колгот|гольф/u.test(text) ? "accessory" : /плать/u.test(text) ? "dress" : null;
  const removing = input.action?.type === "remove" || (/(?:не\s+нуж|не\s+надо|без\s|убер|откаж|не\s+хочу)/u.test(text) && mentioned !== null);
  const cheaper = (!input.action || input.action.type === "search") && /дешевле|дешёвле|подешевле|более\s+дешев/u.test(text);
  const replacing = /замен|друг(?:ие|ую|ое|ой)|не\s+нрав|не\s+подход/u.test(text);
  if (input.action && "slot" in input.action) slot = input.action.slot;
  else if (mentioned) slot = mentioned;
  context.activeSlot = slot;
  if (input.action?.type === "search" && input.action.categoryId) {
    const categoryId = input.action.categoryId;
    if (!slotCategories(slot).some(category => category.id === categoryId)) throw new AssistantError("Категория недоступна.", 404);
    context.criteria[slot].categoryId = categoryId;
  }
  if (removing) { context.selected[slot] = null; prefix = `Хорошо, ${slot === "shoes" ? "без обуви" : slot === "accessory" ? "без аксессуара" : "убираю платье из выбора"}. Остальные выбранные вещи сохраняю.`; }
  if (!input.action || input.action.type === "search") {
    const evidenceMessages = input.context || slot !== "dress" ? [{ role: "assistant" as const, content: "Какой размер?" }, { role: "user" as const, content: latest }] : messages;
    const extracted = replayCriteria(evidenceMessages, tools.branches, branchId);
    const criteria = context.criteria[slot];
    if (extracted.size !== null) criteria.size = extracted.size;
    if (extracted.color !== null) criteria.color = extracted.color;
    else if (mentionsColorRequest(text)) criteria.color = null;
    const dateMentions = text.match(/(?:\d{4}[-.]\d{2}[-.]\d{2}|\d{2}[./]\d{2}[./]\d{4})/g) ?? [];
    if (!context.calendarPeriod) {
    if (dateMentions.length >= 2) { context.from = extracted.from; context.until = extracted.until; }
    else if (dateMentions.length === 1 && /возврат|верну|принесу|сдам/u.test(text)) context.until = extracted.until;
    else if (dateMentions.length === 1 && /получ|заберу|начал/u.test(text)) context.from = extracted.from;
    else if (dateMentions.length === 1 && input.context) {
      // A date-only answer fills the endpoint we were waiting for. Never replace
      // the known pickup with the parser's default "first date is pickup".
      const value = extracted.from ?? extracted.until;
      if (!context.from) context.from = value;
      else if (!context.until) context.until = value;
    }
    else { if (extracted.from) context.from = extracted.from; if (extracted.until) context.until = extracted.until; }
    }
    const category = slotCategories(slot).filter(category => {
      const leaf = category.name.split(">").at(-1)!.trim().toLowerCase();
      return text.includes(leaf) || (slot === "shoes" && /туфл/u.test(text) && /туфли/u.test(leaf))
        || (slot === "accessory" && /ободок|волос|голов/u.test(text) && /волос|голов/u.test(leaf))
        || (slot === "accessory" && /украшен|бижутер/u.test(text) && /бижутер/u.test(leaf));
    });
    if (category.length === 1) criteria.categoryId = category[0].id;
  }
  // Validate after merging the latest correction, before any selected-item read.
  // An incomplete conversational period is a draft, not a request for availability.
  if (context.from || context.until) {
    try {
      const branch = tools.branches.find(branch => branch.id === branchId);
      const from = context.from ? parseBusinessLocalDateTime(context.from, branch?.timezone ?? "UTC") : null;
      const until = context.until ? parseBusinessLocalDateTime(context.until, branch?.timezone ?? "UTC") : null;
      if (branch && ((from && (from.getTime() < Date.now() || from.getTime() > Date.now() + 366 * 86400000))
        || (until && (until.getTime() < Date.now() || until.getTime() > Date.now() + 397 * 86400000)))) throw new Error();
      if (from && until && (until <= from || until.getTime() - from.getTime() > 31 * 86400000)) throw new Error();
    } catch { throw new AssistantError("Выберите будущий период до 31 дня, не далее года вперёд. Возврат — позже получения; время местное для филиала."); }
  }
  if (input.action?.type === "period" && (!branchId || !context.from || !context.until)) throw new AssistantError("Выберите филиал, обе даты и время.");
  const refresh = async () => {
    if (!branchId || !context.from || !context.until) {
      if (Object.values(context.selected).some(Boolean)) throw new AssistantError("Для выбранных товаров нужны филиал и даты.");
      return;
    }
    for (const selectedSlot of ["dress", "shoes", "accessory"] as const) {
      const variantId = context.selected[selectedSlot];
      if (!variantId) continue;
      const card = await untilAborted(() => tools.select({ branchId, from: context.from!, until: context.until!, variantId }), signal);
      if (!slotCategories(selectedSlot).some(category => category.id === card.categoryId)) throw new AssistantError("Выбранный товар не относится к нужной части комплекта.");
      outfit[selectedSlot] = card;
    }
  };
  if (input.action?.type === "select") {
    context.selected[slot] = input.action.variantId;
    if (new Set(Object.values(context.selected).filter(Boolean)).size !== Object.values(context.selected).filter(Boolean).length) throw new AssistantError("Товар уже выбран.");
  }
  await refresh();
  const nextChoices = (["shoes", "accessory"] as const).filter(next => !context.selected[next] && slotCategories(next).length).map(next => ({ label: next === "shoes" ? "Подобрать обувь" : "Подобрать аксессуар", slot: next }));
  const reply = (message: string, cards: ChatCard[] = [], choices: ChatReply["choices"] = []) => ({ message, cards, context, outfit, choices });
  if (input.action?.type === "compare") {
    if (!input.products?.length) return reply("Выберите товары в избранном для сравнения. Заявка не создана.");
    const comparisons = [];
    for (const ref of [...new Map((input.products ?? []).map(ref => [ref.productId + ":" + (ref.executionId ?? ""), ref])).values()]) comparisons.push(await untilAborted(() => tools.product({ productId: ref.productId, executionId: ref.executionId ?? "" }), signal));
    if (comparisons.some(value => !value || typeof value !== "object" || "error" in value)) return reply("Один из сохранённых товаров недоступен. Обновите избранное; наличие не подтверждено.");
    return { ...reply("Проверены опубликованные карточки выбранных товаров. Размеры — из каталога, рост не гарантирует посадку. Для цены и наличия нужны точный размер, филиал и даты."), comparisons };
  }
  if (/правил|как.*аренд|как.*прокат/u.test(text)) {
    const rules = await untilAborted(() => tools.execute("get_rental_rules", {}), signal) as { steps: string[]; confirmation: string };
    return reply(rules.steps.join(" → ") + ". " + rules.confirmation);
  }
  if (input.action?.type === "more" && (!nextSearch || nextSearch.slot !== slot)) return reply("Начните новый поиск по сохранённым условиям — продолжение списка больше недоступно.");
  if (input.action?.type === "restore") return reply("Диалог восстановлен. Даты, филиал и выбранные вещи проверены заново; наличие подтверждает сотрудник. Продолжим подбор.");
  if (input.action?.type === "period") return reply(Object.keys(outfit).length ? "Период изменён, выбранные вещи проверены заново. Пожелания сохранены; наличие подтверждает сотрудник." : "Период выбран. Какое платье и размер вам нужны? Есть пожелания по цвету?");
  if (input.action?.type === "select") return reply(`Добавила ${slotLabel[slot]} в ваш выбор: ${outfit[slot]!.item.name}, ${outfit[slot]!.item.size}. ${nextChoices.length ? "Продолжим собирать образ?" : "Можно отправить выбранные вещи одной заявкой сотруднику."} Это пока не бронь.`, [], nextChoices);
  if (removing) return reply(prefix + " Можно продолжить выбор или отправить заявку.", [], nextChoices);
  if (/^(нет|не надо|пока нет|спасибо)[.!\s]*$/u.test(text)) return reply("Хорошо, ничего не добавляю. Выбранные вещи остаются; можно оформить заявку или продолжить позже.");
  if (/^(да|давай|давайте)[.!\s]*$/u.test(text) && Object.keys(outfit).length && nextChoices.length) return reply("Что добавим к выбранному?", [], nextChoices);
  if (input.action?.type === "finish" || /оформ|заявк|достаточно|все\s+выбра/u.test(text)) return reply(Object.keys(outfit).length ? "Подготовлен черновик выбранных вещей и пожеланий. Он не отправлен, заявка в CRM не создана. Сотрудник должен подтвердить цены, наличие и посадку." : "Сначала выберите вещь кнопкой на карточке — я не добавляю товары без вашего решения.");
  if (/комплект|дополн|к\s+(?:этому|нему|ней)/u.test(text) && !mentioned) return reply((outfit.dress ? "Можно дополнить выбранное платье" : "Можно выбрать платье, а затем дополнить его") + " обувью или аксессуаром из каталога. Совместимость по стилю пока проверяет сотрудник — таких признаков в данных нет.", [], nextChoices);
  if (cheaper && !outfit[slot]) return reply("Сначала выберите вещь для сравнения цены. Даты и пожелания сохраняются; цену-ориентир я не придумываю.");
  if (cheaper && !outfit[slot]!.item.price) return reply("У выбранной вещи нет подтверждённой каталожной цены. Сотрудник уточнит её; пока не могу определить, что дешевле.");
  if (!cheaper && /цен|стоим|сколько/u.test(text) && Object.keys(outfit).length) return reply(Object.values(outfit).every(card => card?.item.price === null) ? "У выбранных вещей каталожные цены пока не заполнены. Сотрудник уточнит стоимость; сумму комплекта я не придумываю." : "На карточках указаны только подтверждённые цены. Недостающие цены и итоговую стоимость уточнит сотрудник.", [], nextChoices);
  if (/подойдет|сочета|по\s+стилю|красиво/u.test(text) && Object.keys(outfit).length) return reply("Могу проверить цвет, размер и наличие по каталогу. Совместимость по стилю в данных не описана — её подтвердит сотрудник. Хотите заменить одну из вещей?", [], (["dress", "shoes", "accessory"] as const).filter(part => context.selected[part]).map(part => ({ label: `Заменить ${slotLabel[part]}`, slot: part })));
  if (replacing) prefix = `Заменим только ${slotLabel[slot]}. Остальной выбор сохраняю. `;
  const categories = slotCategories(slot), criteria = context.criteria[slot];
  if (!categories.length) return reply(`Сейчас в опубликованном каталоге нет раздела «${slotLabel[slot]}». Не буду предлагать вымышленные товары.`);
  if (!criteria.categoryId && categories.length === 1) criteria.categoryId = categories[0].id;
  if (!criteria.categoryId) return reply(prefix + (slot === "accessory" ? "Что добавим к образу? Вот реальные разделы аксессуаров." : "Какую обувь посмотрим?"), [], categories.slice(0, 12).map(category => ({ label: category.name.split(">").at(-1)!.trim(), categoryId: category.id, slot })));
  if (!branchId) return reply("Выберите филиал над диалогом — остальные пожелания сохраняются.");
  if (slot === "shoes" && !criteria.size) return reply(prefix + (outfit.dress ? "Платье оставляем. " : "") + "Какой размер обуви нужен? Размер платья для туфель не использую.");
  if (slot === "dress" && (!criteria.size || criteria.color === null || !context.from || !context.until)) {
    const decorated: CrmToolRunner = { ...tools, get searched() { return tools.searched; }, execute: (name, args) => tools.execute(name, { ...(args as object), categoryId: criteria.categoryId }) };
    const result = await runConversation({ syntheticOnly: true, branchId, messages, context }, provider, decorated, signal);
    if (result.cards[0]) { criteria.size = result.cards[0].item.size; context.from = result.cards[0].from; context.until = result.cards[0].until; }
    context.nextSearch = result.context?.nextSearch;
    return reply(prefix + result.message, result.cards);
  }
  if (criteria.color === null) return reply("Какой цвет нужен для этой вещи? Остальные части комплекта сохраняю. Можно выбрать любой цвет.");
  if (!context.from || !context.until) return reply("На какие даты и время нужен комплект? Укажите получение и возврат; период будет общим для выбранных вещей.");
  const result = await untilAborted(() => tools.execute("find_dresses", { branchId, from: context.from!, until: context.until!, size: criteria.size ?? "", color: criteria.color ?? "", categoryId: criteria.categoryId!, search: "", ...(nextSearch ? { page: nextSearch.page, offset: nextSearch.offset } : {}) }), signal) as SearchToolResult;
  if (result.error || !tools.searched) return reply(result.error ?? "Каталог сейчас не ответил. Ваш выбор сохранён; можно попробовать позже.");
  context.nextSearch = result.next ? { ...result.next, slot } : undefined;
  const cards = [...tools.cards.values()].filter(card => !replacing || card.item.id !== context.selected[slot]);
  if (cheaper) {
    // Compare exact integer minor units only within this bounded CRM batch.
    // Do not convert currencies, broaden criteria or replace the user's selection.
    const reference = outfit[slot]!.item.price!;
    const alternatives = cards.filter(card => card.item.id !== context.selected[slot] && card.item.available
      && card.item.price?.currency === reference.currency && BigInt(card.item.price.amountMinor) < BigInt(reference.amountMinor))
      .sort((a, b) => {
        const left = BigInt(a.item.price!.amountMinor), right = BigInt(b.item.price!.amountMinor);
        return left < right ? -1 : left > right ? 1 : 0;
      });
    delete context.nextSearch;
    return reply((alternatives.length ? "В текущей проверенной порции CRM найдены доступные варианты дешевле выбранной вещи, в той же валюте. Они расположены по возрастанию цены. " : "В текущей проверенной порции CRM нет доступных вариантов с подтверждённой ценой ниже выбранной вещи в той же валюте. ")
      + "Это не поиск минимальной цены по всему каталогу. Выбранная вещь, даты и пожелания сохранены; итоговую цену и наличие подтверждает сотрудник.", alternatives);
  }
  const branch = tools.branches.find(candidate => candidate.id === branchId)!;
  return reply(prefix + (cards.length ? `Вот ${slot === "shoes" ? "обувь" : slot === "accessory" ? "аксессуары" : "платья"} из каталога${criteria.size ? `, размер ${criteria.size}` : ""}. В текущей порции сначала доступны на выбранные даты; это не оценка стиля. Выберите карточку, чтобы добавить вещь. ` : "По подтверждённым цветовым меткам и размеру вариантов не найдено. У части товаров цвет может быть не заполнен — сотрудник уточнит. Можем изменить цвет только по вашему выбору. ") + `${branchLabel(branch)}; ${context.from.replace("T", " ")} — ${context.until.replace("T", " ")}, ${branch.timezone}. Цена и наличие требуют подтверждения${slot !== "dress" ? "; совместимость с платьем не подтверждена" : ""}.`, cards);
}
