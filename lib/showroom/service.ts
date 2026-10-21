import { getCatalogAvailability } from "@/lib/availability/batch-read";
import { catalogSizeLabel, compareCatalogSizes, catalogSizeWhere } from "./size-presentation";
import { rentalPeriod, PERIOD_HINT, rentalPeriodLabel, RENTAL_CONDITIONS } from "./period";
import { colorPhotoCards, type ColorPhotoCard } from "./color-cards";
import { selectedRentalPrice, rentalPriceSummary } from "./prices";
import { createInquiryRecord } from "@/lib/inquiries/record";
import { catalogColorGroupMatches, resolveCatalogColor, type ColorGroup } from "./color-groups";
import { categoryIds } from "./categories";
import { confirmedColorMatches, resolveColorRequest } from "@/lib/assistant/colors";
import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createTenantContext } from "@/lib/tenant/context";
import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";
import { allowRequestTiming, timed } from "./request-timing";
import { getPermanentFleetReductionAvailabilityWithClient, getVariantAvailability } from "@/lib/availability/capacity";
import { variantOperationWhere } from "@/lib/catalog/operation-policy";
import { publicPhotos, readPublicPhoto, withPublicPhotos, representativePublicPhotos } from "./photos";
import { requireInquiryIntake, requireInquiryTransactionAccess } from './inquiry-access';
import { ownerMainRestricted } from "@/lib/assistant/owner-day-config";
import { requireOwnerDaySession } from "@/lib/assistant/owner-day-access";
import { AssistantError } from "@/lib/assistant/chat/limits";
import { purchaseSelectionInput, type ShowroomMode, browseInput, productInput, selectionInput, type PublicCategory, type PublicBrowse, type PublicProductDetail, publicInquiryInput, searchInput, type PublicBranch, type PublicCatalog, type PublicVariant } from "./contracts";

export class ShowroomError extends Error {
  constructor(message: string, public readonly status = 400, public readonly retryAfter = 3600) { super(message); }
}
async function tenant() {
  // Explicit server binding. No URL, body, cookie or client-supplied tenant fallback.
  const id = process.env.STOREFRONT_ORGANIZATION_ID;
  if (!z.string().uuid().safeParse(id).success) throw new ShowroomError("Витрина пока недоступна.", 503);
  // Preview may read the explicitly bound public CRM catalog; the AI pilot gate is separate.
  // Opening a Production storefront remains a separate release decision.
  if (process.env.VERCEL_ENV === "production") throw new ShowroomError("Витрина пока недоступна.", 503);
  if (ownerMainRestricted()) {
    try { await requireOwnerDaySession(); allowRequestTiming(); }
    catch (error) { throw new ShowroomError("Витрина доступна только разрешённому владельцу в согласованное время.", error instanceof AssistantError ? error.status : 503); }
  }
  return createTenantContext(id!);
}
function branches(organizationId: string) {
  return { organizationId, isPublic: true, status: "ACTIVE" as const, organization: { status: "ACTIVE" as const } };
}
function variants(organizationId: string, mode: ShowroomMode = "rental"): Prisma.ProductVariantWhereInput {
  return variantOperationWhere(organizationId, mode === "purchase" ? "SALE" : "RENTAL", true);
}
function period(fromValue: string, untilValue: string, timezone: string) {
 try { return rentalPeriod(fromValue, untilValue, timezone); } catch { throw new ShowroomError(PERIOD_HINT); }
}
export async function publicBranches(): Promise<PublicBranch[]> {
  const { organizationId } = await tenant();
  return db.branch.findMany({ where: branches(organizationId), select: { id: true, name: true, city: true, timezone: true },
    orderBy: [{ city: "asc" }, { sortOrder: "asc" }, { id: "asc" }], take: 100 });
}
// Resolve colour at model/execution level before paginating; never filter one browser page.
async function applyColorGroup(where: Prisma.ProductVariantWhereInput, organizationId: string, group: ColorGroup | "") {
  if (!group) return;
  const candidates = await db.productVariant.groupBy({ by: ["productId", "executionId"], where,
    orderBy: [{ productId: "asc" }, { executionId: "asc" }], take: 2001 });
  if (candidates.length > 2000) throw new ShowroomError("Слишком широкий каталог. Уточните категорию, размер или название.");
  if (!candidates.length) { where.AND = [...(where.AND as Prisma.ProductVariantWhereInput[]), { id: { in: [] } }]; return; }
  const products = await db.product.findMany({ where: { organizationId, id: { in: candidates.map(g => g.productId) }, variants: { some: where } },
    select: { id: true, color: true, executions: { where: { organizationId, isActive: true, id: { in: candidates.flatMap(g => g.executionId ? [g.executionId] : []) } }, select: { id: true, name: true } } } });
  const matches = candidates.filter(candidate => {
    const product = products.find(p => p.id === candidate.productId);
    const execution = product?.executions.find(e => e.id === candidate.executionId);
    return product && (!candidate.executionId || execution) && catalogColorGroupMatches(group, execution?.name ?? null, product.color);
  });
  where.AND = [...(where.AND as Prisma.ProductVariantWhereInput[]), matches.length ? { OR: matches.map(g => ({ productId: g.productId, executionId: g.executionId })) } : { id: { in: [] } }];
}
export async function publicCatalog(raw: unknown): Promise<PublicCatalog> { return catalogForSelection(raw); }
async function catalogForSelection(raw: unknown, variantId?: string): Promise<PublicCatalog> {
  const parsed = searchInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Проверьте филиал, размер и даты.");
  let resolved: ReturnType<typeof resolveColorRequest>;
  try {
    if (parsed.data.colorGroup && parsed.data.color) throw new Error("Выберите группу или отдельный цвет, не оба сразу.");
    resolved = parsed.data.colorGroup ? { color: "", search: parsed.data.search } : resolveColorRequest(parsed.data.color, parsed.data.search);
  }
  catch (error) { throw new ShowroomError(error instanceof Error ? error.message : "Уточните цвет."); }
  const input = { ...parsed.data, ...resolved }, context = await tenant(), organizationId = context.organizationId;
  const branch = await db.branch.findFirst({ where: { ...branches(organizationId), id: input.branchId }, select: { timezone: true } });
  if (!branch) throw new ShowroomError("Филиал недоступен.", 404);
  const { from, until } = period(input.from, input.until, branch.timezone), now = new Date();
  const where: Prisma.ProductVariantWhereInput = { AND: [variants(organizationId),
    input.search ? { product: { name: { contains: input.search, mode: "insensitive" } } } : {},
    variantId ? { id: variantId } : {},
    input.size ? { size: catalogSizeWhere(input.size) } : {}
  ] };
  if (input.categoryId) (where.AND as Prisma.ProductVariantWhereInput[]).push({ product: { categoryId: input.categoryId, category: { organizationId, status: "ACTIVE" } } });
  if (input.color) {
    // Resolve only eligible size/model candidates; filter colour BEFORE group pagination.
    const candidates = await db.productVariant.findMany({ where, select: { id: true, product: { select: { color: true } }, execution: { select: { name: true } } }, take: 1001 });
    if (candidates.length > 1000) throw new ShowroomError("Слишком широкий подбор. Уточните точный размер или название модели.");
    const ids = candidates.filter(row => confirmedColorMatches(input.color, row.execution?.name ?? null, row.product.color)).map(row => row.id);
    if (!ids.length) return { items: [], more: false, page: input.page, appliedColor: input.color };
    where.AND = [...(where.AND as Prisma.ProductVariantWhereInput[]), { id: { in: ids } }];
  }
  await applyColorGroup(where, organizationId, input.colorGroup);
  // Page model/execution keys in SQL before loading their sizes. Labels are not IDs.
  const groups = await db.productVariant.groupBy({ by: ["productId", "executionId"], where,
    orderBy: [{ productId: "asc" }, { executionId: "asc" }], take: 9, skip: (input.page - 1) * 8 });
  const pageGroups = groups.slice(0, 8);
  if (!pageGroups.length) return { items: [], more: false, page: input.page, appliedColor: input.color || null };
  const rows = await db.productVariant.findMany({ where: { AND: [where,
    { OR: pageGroups.map(group => ({ productId: group.productId, executionId: group.executionId })) }
  ] }, select: { id: true, productId: true, executionId: true, product: { select: { name: true, color: true } }, size: { select: { name: true, code: true, sizeSystem: true, recommendedHeightCm: true } },
    execution: { select: { name: true } }, prices: {
      where: { organizationId, type: "RENTAL", validFrom: { lte: now }, AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, { OR: [{ branchId: input.branchId }, { branchId: null }] }
      ] }, select: { amountMinor: true, currency: true, branchId: true }, orderBy: [{ validFrom: "desc" }, { id: "asc" }]
    } }, orderBy: [{ productId: "asc" }, { executionId: "asc" }, { size: { sortOrder: "asc" } }, { id: "asc" }], take: 257 });
  // Never silently truncate a group's sizes. Bound expensive availability reads.
  if (rows.length > 256) throw new ShowroomError("Слишком много размеров. Уточните размер или название.");
  rows.sort((a, b) => compareCatalogSizes(a.size, b.size) || a.id.localeCompare(b.id));
  const matchedRows = input.color ? rows.filter(row => confirmedColorMatches(input.color, row.execution?.name ?? null, row.product.color)) : rows;
  const batchAvailability = matchedRows.length > 1 ? await timed("availability", () => getCatalogAvailability({ tenant: context, branchId: input.branchId, variantIds: matchedRows.map(row => row.id), requestedFrom: from, requestedUntil: until })) : null;
  const options = new Map<string, PublicVariant>();
  for (let offset = 0; offset < matchedRows.length; offset += 2) {
    const batch = await Promise.all(matchedRows.slice(offset, offset + 2).map(async row => {
      const availability = batchAvailability ? batchAvailability.get(row.id)! : await timed("availability", () => getVariantAvailability({ tenant: context, branchId: input.branchId, productVariantId: row.id, requestedFrom: from, requestedUntil: until }));
      const price = selectedRentalPrice(row.prices, input.branchId);
      return { id: row.id, name: row.product.name, size: catalogSizeLabel(row.size), execution: row.execution?.name ?? null,
        price,
        available: availability.canFulfill };
    }));
    for (const option of batch) options.set(option.id, option);
  }
  const items: PublicCatalog["items"] = [];
  for (const group of pageGroups) {
    const members = matchedRows.filter(row => row.productId === group.productId && row.executionId === group.executionId);
    const first = members[0];
    if (!first) continue; // Publication may change between the two reads.
    items.push({ id: group.productId + ":" + (group.executionId ?? "default"), productId: group.productId, executionId: group.executionId,
      name: first.product.name, execution: first.execution?.name ?? null, color: first.product.color,
      colorLabel: resolveCatalogColor(first.execution?.name ?? null, first.product.color).label,
      variants: members.map(row => options.get(row.id)!) });
  }
  return { items, more: groups.length > 8 && input.page < 100, page: input.page, appliedColor: input.color || null };
}

export async function submitPublicInquiry(raw: unknown): Promise<{ id: string }> {
  // A second server-side gate protects direct service callers as well as the route.
  const actor = await requireInquiryIntake();
  const parsed = publicInquiryInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Проверьте форму и контакт: телефон или email.");
  const input = parsed.data, { organizationId } = await tenant();
  const preferredVisit = "preferredVisit" in input ? input.preferredVisit : undefined;
  const selectedIds = [...(input.variantId ? [input.variantId] : []), ...(("additionalVariantIds" in input ? input.additionalVariantIds : undefined) ?? [])];
  if (new Set(selectedIds).size !== selectedIds.length) throw new ShowroomError("В заявке есть повторяющиеся товары.");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  // Shared database lock makes limits and idempotency work across server processes.
  return db.$transaction(async tx => {
    await requireInquiryTransactionAccess(tx, actor);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`showroom:${organizationId}`}, 0))`;
    const branch = await tx.branch.findFirst({ where: { ...branches(organizationId), id: input.branchId }, select: { timezone: true } });
    if (!branch) throw new ShowroomError("Филиал больше недоступен. Обновите витрину.", 404);
    const variant = input.variantId ? await tx.productVariant.findFirst({ where: { AND: [variants(organizationId, input.purpose === "purchase" ? "purchase" : "rental"), { id: input.variantId }] },
      select: { id: true, sku: true, execution: { select: { name: true } }, product: { select: { name: true } }, size: { select: { name: true, code: true, sizeSystem: true, recommendedHeightCm: true } } } }) : null;
    if (input.variantId && !variant) throw new ShowroomError("Товар или филиал больше недоступен. Обновите витрину.", 404);
    const additional = ("additionalVariantIds" in input ? input.additionalVariantIds : undefined)?.length ? await tx.productVariant.findMany({
      where: { AND: [variants(organizationId, input.purpose === "purchase" ? "purchase" : "rental"), { id: { in: ("additionalVariantIds" in input ? input.additionalVariantIds : undefined) } }] },
      select: { id: true, sku: true, execution: { select: { name: true } }, product: { select: { name: true } }, size: { select: { name: true, code: true, sizeSystem: true, recommendedHeightCm: true } } }
    }) : [];
    if (additional.length !== (("additionalVariantIds" in input ? input.additionalVariantIds : undefined)?.length ?? 0)) throw new ShowroomError("Один из товаров комплекта больше недоступен. Обновите выбор.", 404);
    const selected = [...(variant ? [variant] : []), ...additional];
    // Model-level interest has no invented size/variant. Reuse the same public
    // rental publication policy, without stock/availability or price reads.
    const interest = input.purpose === "fitting" && input.productId ? await tx.product.findFirst({
      where: { id: input.productId, organizationId, variants: { some: variants(organizationId) } },
      select: { id: true, name: true }
    }) : null;
    if (input.purpose === "fitting" && input.productId && !interest) throw new ShowroomError("Товар больше недоступен. Обновите витрину.", 404);
    const previous = await tx.inquiry.findUnique({ where: { organizationId_creationKey: { organizationId, creationKey: input.creationKey } },
      select: { id: true, creationHash: true, source: true, createdByUserId: true } });
    if (previous) {
      if (previous.creationHash !== hash || previous.source !== "WEBSITE" || previous.createdByUserId !== (actor?.userId ?? null))
        throw new ShowroomError("Форма изменилась. Начните новую заявку.", 409);
      return { id: previous.id };
    }
    const purchase = input.purpose === "purchase" ? await purchaseOption(tx, organizationId, input.branchId, input.variantId) : null;
    if (input.purpose === "purchase") {
      if (!purchase?.price) throw new ShowroomError("Цена продажи не указана. Уточните её у сотрудника.", 409);
      if (purchase.price.amountMinor !== input.expectedPrice.amountMinor || purchase.price.currency !== input.expectedPrice.currency)
        throw new ShowroomError("Цена продажи изменилась. Проверьте товар заново перед отправкой.", 409);
      if (!purchase.available) throw new ShowroomError("Этот размер сейчас недоступен для покупки.", 409);
    }
    const { from, until } = input.purpose === "booking" ? period(input.from, input.until, branch.timezone) : { from: null, until: null };
    if (preferredVisit) {
      if (input.purpose !== "fitting") throw new ShowroomError("Пожелание к визиту допустимо только для примерки.");
      let visit: Date;
      try { visit = parseBusinessLocalDateTime(preferredVisit, branch.timezone); }
      catch { throw new ShowroomError("Проверьте пожелание к дате примерки."); }
      if (visit.getTime() < Date.now() || visit.getTime() > Date.now() + 366 * 86400000) throw new ShowroomError("Выберите будущую дату примерки не далее года вперёд.");
    }
    const recent = { organizationId, source: "WEBSITE" as const, createdByUserId: actor?.userId ?? null, createdAt: { gte: new Date(Date.now() - 3600000) } };
    const total = await tx.inquiry.count({ where: recent });
    const perContact = await tx.inquiry.count({ where: { ...recent, replyContact: input.replyContact } });
    if (total >= 30 || perContact >= 3) throw new ShowroomError("Слишком много заявок. Попробуйте позже.", 429);
    const result = await createInquiryRecord(tx, {
      organizationId, branchId: input.branchId, source: "WEBSITE", createdByUserId: actor?.userId ?? null,
      subject: `${input.purpose === "purchase" ? "Заявка на покупку" : input.purpose === "fitting" ? "Запрос примерки" : "Заявка на бронь"} с сайта${selected.length || interest ? ": " + (interest?.name ?? selected.map(item => item.product.name).join(" + ")) : ""}`.slice(0, 200), replyContact: input.replyContact,
      requestText: [purchase?.price ? `Тип: ПОКУПКА (SALE). Количество: 1. Цена продажи из CRM: ${purchase.price.amountMinor} в минимальных единицах ${purchase.price.currency}. Оплата, продажа и резерв не выполнены; требуется подтверждение сотрудником.` : null, input.purpose === "booking" ? rentalPeriodLabel(input.from,input.until)+". "+RENTAL_CONDITIONS : null, input.purpose === "fitting" ? `Запрос примерки: запись не подтверждена, товар не резервируется. Время и сотрудника нужно согласовать; базовая длительность — 30 минут.${preferredVisit ? ` Пожелание: ${preferredVisit.replace("T", " ")} (${branch.timezone}).` : ""}` : null, interest ? `Интерес к модели: ${interest.name.slice(0, 200)} (${interest.id}). Размер уточнить.` : null, input.requestText].filter(Boolean).join("\n") || null,
      requestedFrom: from, requestedUntil: until, requestedSize: selected.map(item => item.size.name || item.size.code).join(" / ").slice(0, 100) || null,
      creationKey: input.creationKey, creationHash: hash,
      items: { create: selected.map(item => ({ organizationId, productVariantId: item.id, nameSnapshot: `${item.product.name}${item.execution ? ` · ${item.execution.name}` : ""}`,
        sizeSnapshot: item.size.name || item.size.code, skuSnapshot: item.sku })) }
    }, { source: "API", itemCount: selected.length, actorUserId: actor?.userId, actorMembershipId: actor?.membershipId });
    await requireInquiryTransactionAccess(tx, actor);
    return result;
  }, { timeout: 10000 });
}

// Browsing is immediate without dates; optional dates use the same CRM availability.
export async function publicCategories(mode: ShowroomMode = "rental"): Promise<PublicCategory[]> {
  const { organizationId } = await tenant();
  return db.category.findMany({ where: { organizationId, status: "ACTIVE", products: { some: { variants: { some: variants(organizationId, mode) } } } },
    select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }] });
}
export async function publicBrowse(raw: unknown): Promise<PublicBrowse> {
  const parsed = browseInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Проверьте параметры каталога.");
  const input = parsed.data, context = await tenant(), { organizationId } = context;
  if (input.mode === "purchase" && (input.from || input.until)) throw new ShowroomError("Для покупки даты аренды не нужны.");
  if (Boolean(input.from) !== Boolean(input.until) || ((input.from || input.until) && !input.branchId)) throw new ShowroomError("Для проверки наличия выберите филиал, получение и возврат.");
  const branch = input.branchId ? await db.branch.findFirst({ where: { ...branches(organizationId), id: input.branchId }, select: { timezone: true } }) : null;
  if (input.branchId && !branch) throw new ShowroomError("Филиал недоступен.", 404);
  const dates = input.from && input.until && branch ? period(input.from, input.until, branch.timezone) : null;
  const selectedCategories = input.categoryId ? categoryIds(await publicCategories(input.mode), input.categoryId) : [];
  if (input.categoryId && !selectedCategories.length) throw new ShowroomError("Раздел больше недоступен.", 404);
  const where: Prisma.ProductVariantWhereInput = { AND: [variants(organizationId, input.mode),
    input.search ? { product: { name: { contains: input.search, mode: "insensitive" } } } : {},
    input.categoryId ? { product: { categoryId: { in: selectedCategories }, category: { organizationId, status: "ACTIVE" } } } : {},
    input.size ? { size: catalogSizeWhere(input.size) } : {}
  ] };
  await applyColorGroup(where, organizationId, input.colorGroup);
  const groups = await db.productVariant.groupBy({ by: ["productId", "executionId"], where,
    orderBy: [{ productId: "asc" }, { executionId: "asc" }], take: 13, skip: (input.page - 1) * 12 });
  const selected = groups.slice(0, 12);
  if (!selected.length) return { items: [], more: false, page: input.page };
  // Public metadata and current rental prices only; no cost, margin, stock IDs or contacts.
  const now = new Date();
  const products = await db.product.findMany({ where: { organizationId, id: { in: selected.map(g => g.productId) },
    variants: { some: where } }, select: { id: true, name: true, color: true,
      executions: { where: { organizationId, isActive: true, id: { in: selected.flatMap(g => g.executionId ? [g.executionId] : []) } }, select: { id: true, name: true } } } });
  const rows = await db.productVariant.findMany({ where: { AND: [where, { OR: selected.map(g => ({ productId: g.productId, executionId: g.executionId })) }] },
    select: { id: true, productId: true, executionId: true, size: { select: { name: true, code: true, sizeSystem: true, recommendedHeightCm: true } }, prices: input.branchId ? {
      where: { organizationId, type: input.mode === "purchase" ? "SALE" : "RENTAL", validFrom: { lte: now }, AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, { OR: [{ branchId: input.branchId }, { branchId: null }] }
      ] }, select: { amountMinor: true, currency: true, branchId: true }, orderBy: [{ validFrom: "desc" }, { id: "asc" }]
    } : false },
    orderBy: [{ size: { sortOrder: "asc" } }, { id: "asc" }], take: 257 });
  if (rows.length > 256) throw new ShowroomError("Слишком много размеров. Уточните размер или название.");
  rows.sort((a, b) => compareCatalogSizes(a.size, b.size) || a.id.localeCompare(b.id));
  const available = new Set<string>();
  if (dates) for (let offset = 0; offset < rows.length; offset += 2) {
    await Promise.all(rows.slice(offset, offset + 2).map(async row => {
      const result = await getVariantAvailability({ tenant: context, branchId: input.branchId, productVariantId: row.id, requestedFrom: dates.from, requestedUntil: dates.until });
      if (result.canFulfill) available.add(row.id);
    }));
  }
  const items: PublicBrowse["items"] = [];
  for (const group of selected) {
    const product = products.find(p => p.id === group.productId);
    if (!product) continue;
    const execution = product.executions.find(e => e.id === group.executionId);
    if (group.executionId && !execution) continue;
    items.push({ id: group.productId + ":" + (group.executionId ?? "default"), productId: group.productId,
      executionId: group.executionId, name: product.name, color: product.color, execution: execution?.name ?? null,
      colorLabel: resolveCatalogColor(execution?.name ?? null, product.color).label,
      ...(input.branchId ? { priceSummary: rentalPriceSummary(rows.filter(r => r.productId === group.productId && r.executionId === group.executionId).map(r => selectedRentalPrice(r.prices, input.branchId))) } : {}),
      sizes: [...new Set(rows.filter(r => r.productId === group.productId && r.executionId === group.executionId).map(r => catalogSizeLabel(r.size)))],
      ...(dates ? { availableSizes: [...new Set(rows.filter(r => r.productId === group.productId && r.executionId === group.executionId && available.has(r.id)).map(r => catalogSizeLabel(r.size)))] } : {}) });
  }
  return { items: await withPublicPhotos(organizationId, items, input.mode), more: groups.length > 12 && input.page < 100, page: input.page };
}

// Home colour representatives span the eligible dress catalogue, not page one.
// Same tenant/category/variant policy, resolver and protected image delivery as browse.
export async function publicHomePhotoCards(categoryId: string): Promise<PublicBrowse["items"]> {
  const { organizationId } = await tenant();
  if (!await db.branch.findFirst({ where: branches(organizationId), select: { id: true } })) return [];
  const selectedCategories = categoryIds(await publicCategories(), categoryId);
  if (!selectedCategories.length) return [];
  const where: Prisma.ProductVariantWhereInput = { AND: [variants(organizationId),
    { product: { categoryId: { in: selectedCategories }, category: { organizationId, status: "ACTIVE" } } }
  ] };
  const groups = await db.productVariant.groupBy({ by: ["productId", "executionId"], where,
    orderBy: [{ productId: "asc" }, { executionId: "asc" }], take: 2001 });
  // Never silently present a truncated first-page sample as catalogue coverage.
  if (groups.length > 2000) throw new ShowroomError("Подбор цветов временно недоступен.", 503);
  const products = await db.product.findMany({ where: { organizationId, id: { in: groups.map(g => g.productId) }, variants: { some: where } },
    select: { id: true, name: true, color: true, executions: { where: { organizationId, isActive: true, id: { in: groups.flatMap(g => g.executionId ? [g.executionId] : []) } }, select: { id: true, name: true } } } });
  const items = groups.flatMap(group => {
    const product = products.find(p => p.id === group.productId);
    const execution = product?.executions.find(e => e.id === group.executionId);
    if (!product || (group.executionId && !execution)) return [];
    return [{ id: group.productId + ":" + (group.executionId ?? "default"), productId: group.productId, executionId: group.executionId,
      name: product.name, color: product.color, execution: execution?.name ?? null, sizes: [] }];
  });
  const photos = await representativePublicPhotos(organizationId, items);
  // Colour is optional for the editorial product strip; image access/publication is not.
  return items.filter(item => photos.has(item.id)).map(item => ({ ...item, images: [photos.get(item.id)!] }));
}
export async function publicColorPhotoCards(categoryId: string): Promise<ColorPhotoCard[]> {
  return colorPhotoCards(await publicHomePhotoCards(categoryId));
}

export async function publicProduct(raw: unknown, priceBranchId = ""): Promise<PublicProductDetail> {
  const parsed = productInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Товар недоступен.", 404);
  const { organizationId } = await tenant(), input = parsed.data;
  if(priceBranchId && (!z.string().uuid().safeParse(priceBranchId).success || !await db.branch.findFirst({where:{...branches(organizationId),id:priceBranchId},select:{id:true}})))throw new ShowroomError("Филиал недоступен.",404);
  const now=new Date();
  const rows = await db.productVariant.findMany({ where: { AND: [variants(organizationId, input.mode), { productId: input.productId, executionId: input.executionId || null }] },
    select: { id: true, product: { select: { name: true, color: true } }, execution: { select: { name: true } }, size: { select: { name: true, code: true, sizeSystem: true, recommendedHeightCm: true } }, prices: priceBranchId ? {
      where:{organizationId,type:input.mode === "purchase" ? "SALE" : "RENTAL",validFrom:{lte:now},AND:[{OR:[{validUntil:null},{validUntil:{gt:now}}]},{OR:[{branchId:priceBranchId},{branchId:null}]}]},select:{amountMinor:true,currency:true,branchId:true},orderBy:[{validFrom:"desc"},{id:"asc"}]
    }:false },
    orderBy: [{ size: { sortOrder: "asc" } }, { id: "asc" }], take: 257 });
  if (!rows.length) throw new ShowroomError("Товар больше недоступен в витрине.", 404);
  if (rows.length > 256) throw new ShowroomError("Выбор размеров временно недоступен.", 503);
  rows.sort((a, b) => compareCatalogSizes(a.size, b.size) || a.id.localeCompare(b.id));
  return { id: input.productId + ":" + (input.executionId || "default"), productId: input.productId, executionId: input.executionId || null,
    name: rows[0].product.name, color: rows[0].product.color, execution: rows[0].execution?.name ?? null,
    images: await publicPhotos(organizationId, { productId: input.productId, executionId: input.executionId || null, name: rows[0].product.name }, input.mode),
    colorLabel: resolveCatalogColor(rows[0].execution?.name ?? null, rows[0].product.color).label,
    sizes: [...new Set(rows.map(row => catalogSizeLabel(row.size)))],
    priceBranchId, priceSummary:priceBranchId?rentalPriceSummary(rows.map(row=>selectedRentalPrice(row.prices??[],priceBranchId))):null,
    options: rows.map(row => ({ id: row.id, size: catalogSizeLabel(row.size), sizeCode: row.size.code, price:priceBranchId?selectedRentalPrice(row.prices??[],priceBranchId):null })) };
}
export async function publicSelection(raw: unknown): Promise<PublicVariant> {
  const parsed = selectionInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Выберите филиал, размер и даты.");
  const { variantId, ...criteria } = parsed.data;
  const catalog = await catalogForSelection(criteria, variantId);
  const item = catalog.items.flatMap(group => group.variants).find(option => option.id === variantId);
  if (!item) throw new ShowroomError("Выбранный размер больше недоступен.", 404);
  return item;
}

export async function publicPhoto(raw: unknown) {
  const { organizationId } = await timed("photo_auth", tenant);
  return readPublicPhoto(organizationId, raw);
}

// Revalidate an explicit outfit selection. Never trust client names/prices/category.
export async function publicSelectedCard(raw: unknown) {
  const input = selectionInput.parse(raw), { organizationId } = await tenant();
  const row = await db.productVariant.findFirst({ where: { AND: [variants(organizationId), { id: input.variantId }] },
    select: { productId: true, executionId: true, product: { select: { categoryId: true } } } });
  if (!row) throw new ShowroomError("Выбранный товар больше недоступен.", 404);
  const item = await publicSelection(input);
  return { productId: row.productId, executionId: row.executionId, categoryId: row.product.categoryId,
    item, branchId: input.branchId, from: input.from, until: input.until };
}

// Read-only sale preview reuses CRM permanent-capacity rules, including future rentals.
// This does not reserve stock or create a sale/commitment/payment.
async function purchaseOption(client: Prisma.TransactionClient, organizationId: string, branchId: string, variantId: string): Promise<PublicVariant> {
  const now = new Date();
  const branch = await client.branch.findFirst({ where: { ...branches(organizationId), id: branchId }, select: { id: true } });
  if (!branch) throw new ShowroomError("Филиал недоступен.", 404);
  const row = await client.productVariant.findFirst({ where: { AND: [variants(organizationId, "purchase"), { id: variantId }] }, select: {
    id: true, product: { select: { name: true } }, execution: { select: { name: true } },
    size: { select: { name: true, code: true, sizeSystem: true, recommendedHeightCm: true } },
    prices: { where: { organizationId, type: "SALE", validFrom: { lte: now }, AND: [
      { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, { OR: [{ branchId }, { branchId: null }] }
    ] }, select: { amountMinor: true, currency: true, branchId: true }, orderBy: [{ validFrom: "desc" }, { id: "asc" }] }
  } });
  if (!row) throw new ShowroomError("Товар недоступен для покупки.", 404);
  const price = selectedRentalPrice(row.prices, branchId);
  const capacity = await getPermanentFleetReductionAvailabilityWithClient(client, { tenant: createTenantContext(organizationId), branchId, productVariantId: variantId, quantity: 1, confirmedAt: now });
  return { id: row.id, name: row.product.name, execution: row.execution?.name ?? null, size: catalogSizeLabel(row.size), price, available: capacity.canFulfill };
}
export async function publicPurchaseSelection(raw: unknown): Promise<PublicVariant> {
  const parsed = purchaseSelectionInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Выберите филиал и размер.");
  const { organizationId } = await tenant();
  return purchaseOption(db, organizationId, parsed.data.branchId, parsed.data.variantId);
}
