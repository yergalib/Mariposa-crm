import { createInquiryRecord } from "@/lib/inquiries/record";
import { resolveCatalogColor, type ColorGroup } from "./color-groups";
import { categoryIds } from "./categories";
import { confirmedColorMatches, resolveColorRequest } from "@/lib/assistant/colors";
import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createTenantContext } from "@/lib/tenant/context";
import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";
import { getVariantAvailability } from "@/lib/availability/capacity";
import { variantOperationWhere } from "@/lib/catalog/operation-policy";
import { publicPhotos, readPublicPhoto, withPublicPhotos } from "./photos";
import { PUBLIC_INQUIRY_INTAKE_OPEN } from "./release";
import { browseInput, productInput, selectionInput, type PublicCategory, type PublicBrowse, type PublicProductDetail, publicInquiryInput, searchInput, type PublicBranch, type PublicCatalog, type PublicVariant } from "./contracts";

export class ShowroomError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
function tenant() {
  // Explicit server binding. No URL, body, cookie or client-supplied tenant fallback.
  const id = process.env.STOREFRONT_ORGANIZATION_ID;
  if (!z.string().uuid().safeParse(id).success) throw new ShowroomError("Витрина пока недоступна.", 503);
  // Preview may read the explicitly bound public CRM catalog; the AI pilot gate is separate.
  // Opening a Production storefront remains a separate release decision.
  if (process.env.VERCEL_ENV === "production") throw new ShowroomError("Витрина пока недоступна.", 503);
  return createTenantContext(id!);
}
function branches(organizationId: string) {
  return { organizationId, isPublic: true, status: "ACTIVE" as const, organization: { status: "ACTIVE" as const } };
}
function variants(organizationId: string): Prisma.ProductVariantWhereInput {
  return variantOperationWhere(organizationId, "RENTAL", true);
}
function period(fromValue: string, untilValue: string, timezone: string) {
  try {
    const from = parseBusinessLocalDateTime(fromValue, timezone), until = parseBusinessLocalDateTime(untilValue, timezone);
    const now = Date.now();
    if (from.getTime() < now || from.getTime() > now + 366 * 86400000 || until <= from || until.getTime() - from.getTime() > 31 * 86400000) throw new Error();
    return { from, until };
  } catch { throw new ShowroomError("Выберите будущий период до 31 дня, не далее года вперёд. Время — местное для филиала."); }
}
export async function publicBranches(): Promise<PublicBranch[]> {
  const { organizationId } = tenant();
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
    return product && (!candidate.executionId || execution) && resolveCatalogColor(execution?.name ?? null, product.color).group === group;
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
  const input = { ...parsed.data, ...resolved }, context = tenant(), organizationId = context.organizationId;
  const branch = await db.branch.findFirst({ where: { ...branches(organizationId), id: input.branchId }, select: { timezone: true } });
  if (!branch) throw new ShowroomError("Филиал недоступен.", 404);
  const { from, until } = period(input.from, input.until, branch.timezone), now = new Date();
  const where: Prisma.ProductVariantWhereInput = { AND: [variants(organizationId),
    input.search ? { product: { name: { contains: input.search, mode: "insensitive" } } } : {},
    variantId ? { id: variantId } : {},
    input.size ? { size: { OR: [{ name: { equals: input.size, mode: "insensitive" } }, { code: { equals: input.size, mode: "insensitive" } }] } } : {}
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
  ] }, select: { id: true, productId: true, executionId: true, product: { select: { name: true, color: true } }, size: { select: { name: true, code: true } },
    execution: { select: { name: true } }, prices: {
      where: { organizationId, type: "RENTAL", validFrom: { lte: now }, AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, { OR: [{ branchId: input.branchId }, { branchId: null }] }
      ] }, select: { amountMinor: true, currency: true, branchId: true }, orderBy: [{ validFrom: "desc" }, { id: "asc" }]
    } }, orderBy: [{ productId: "asc" }, { executionId: "asc" }, { size: { sortOrder: "asc" } }, { id: "asc" }], take: 257 });
  // Never silently truncate a group's sizes. Bound expensive availability reads.
  if (rows.length > 256) throw new ShowroomError("Слишком много размеров. Уточните размер или название.");
  const matchedRows = input.color ? rows.filter(row => confirmedColorMatches(input.color, row.execution?.name ?? null, row.product.color)) : rows;
  const options = new Map<string, PublicVariant>();
  for (let offset = 0; offset < matchedRows.length; offset += 2) {
    const batch = await Promise.all(matchedRows.slice(offset, offset + 2).map(async row => {
      const availability = await getVariantAvailability({ tenant: context, branchId: input.branchId, productVariantId: row.id, requestedFrom: from, requestedUntil: until });
      const price = row.prices.find(p => p.branchId === input.branchId) ?? row.prices.find(p => p.branchId === null);
      return { id: row.id, name: row.product.name, size: row.size.name || row.size.code, execution: row.execution?.name ?? null,
        price: price && price.amountMinor >= BigInt(0) ? { amountMinor: price.amountMinor.toString(), currency: price.currency } : null,
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

export async function submitPublicInquiry(raw: unknown): Promise<void> {
  // A second server-side gate protects direct service callers as well as the route.
  if (!PUBLIC_INQUIRY_INTAKE_OPEN) throw new ShowroomError("Онлайн-отправка заявок пока не открыта.", 503);
  const parsed = publicInquiryInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Проверьте форму и контакт: телефон или email.");
  const input = parsed.data, { organizationId } = tenant();
  const selectedIds = [input.variantId, ...(input.additionalVariantIds ?? [])];
  if (new Set(selectedIds).size !== selectedIds.length) throw new ShowroomError("В заявке есть повторяющиеся товары.");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  // Shared database lock makes limits and idempotency work across server processes.
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`showroom:${organizationId}`}, 0))`;
    const branch = await tx.branch.findFirst({ where: { ...branches(organizationId), id: input.branchId }, select: { timezone: true } });
    const variant = await tx.productVariant.findFirst({ where: { AND: [variants(organizationId), { id: input.variantId }] },
      select: { id: true, sku: true, execution: { select: { name: true } }, product: { select: { name: true } }, size: { select: { name: true, code: true } } } });
    if (!branch || !variant) throw new ShowroomError("Товар или филиал больше недоступен. Обновите витрину.", 404);
    const additional = input.additionalVariantIds?.length ? await tx.productVariant.findMany({
      where: { AND: [variants(organizationId), { id: { in: input.additionalVariantIds } }] },
      select: { id: true, sku: true, execution: { select: { name: true } }, product: { select: { name: true } }, size: { select: { name: true, code: true } } }
    }) : [];
    if (additional.length !== (input.additionalVariantIds?.length ?? 0)) throw new ShowroomError("Один из товаров комплекта больше недоступен. Обновите выбор.", 404);
    const selected = [variant, ...additional];
    const previous = await tx.inquiry.findUnique({ where: { organizationId_creationKey: { organizationId, creationKey: input.creationKey } },
      select: { creationHash: true, source: true, createdByUserId: true } });
    if (previous) {
      if (previous.creationHash !== hash || previous.source !== "WEBSITE" || previous.createdByUserId !== null)
        throw new ShowroomError("Форма изменилась. Начните новую заявку.", 409);
      return;
    }
    const { from, until } = period(input.from, input.until, branch.timezone);
    if (input.preferredVisit) {
      if (input.purpose !== "fitting") throw new ShowroomError("Пожелание к визиту допустимо только для примерки.");
      let visit: Date;
      try { visit = parseBusinessLocalDateTime(input.preferredVisit, branch.timezone); }
      catch { throw new ShowroomError("Проверьте пожелание к дате примерки."); }
      if (visit.getTime() < Date.now() || visit.getTime() > Date.now() + 366 * 86400000) throw new ShowroomError("Выберите будущую дату примерки не далее года вперёд.");
    }
    const recent = { organizationId, source: "WEBSITE" as const, createdByUserId: null, createdAt: { gte: new Date(Date.now() - 3600000) } };
    const total = await tx.inquiry.count({ where: recent });
    const perContact = await tx.inquiry.count({ where: { ...recent, replyContact: input.replyContact } });
    if (total >= 30 || perContact >= 3) throw new ShowroomError("Слишком много заявок. Попробуйте позже.", 429);
    await createInquiryRecord(tx, {
      organizationId, branchId: input.branchId, source: "WEBSITE", createdByUserId: null,
      subject: `${input.purpose === "fitting" ? "Запрос примерки" : "Заявка на бронь"} с сайта: ${selected.map(item => item.product.name).join(" + ")}`.slice(0, 200), replyContact: input.replyContact,
      requestText: [input.purpose === "fitting" ? `Примерка: время требует согласования сотрудником.${input.preferredVisit ? ` Пожелание: ${input.preferredVisit.replace("T", " ")} (${branch.timezone}).` : ""}` : null, input.requestText].filter(Boolean).join("\n") || null,
      requestedFrom: from, requestedUntil: until, requestedSize: selected.map(item => item.size.name || item.size.code).join(" / ").slice(0, 100),
      creationKey: input.creationKey, creationHash: hash,
      items: { create: selected.map(item => ({ organizationId, productVariantId: item.id, nameSnapshot: `${item.product.name}${item.execution ? ` · ${item.execution.name}` : ""}`,
        sizeSnapshot: item.size.name || item.size.code, skuSnapshot: item.sku })) }
    }, { source: "API", itemCount: selected.length });
  }, { timeout: 10000 });
}

// Browsing is immediate without dates; optional dates use the same CRM availability.
export async function publicCategories(): Promise<PublicCategory[]> {
  const { organizationId } = tenant();
  return db.category.findMany({ where: { organizationId, status: "ACTIVE", products: { some: { variants: { some: variants(organizationId) } } } },
    select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }] });
}
export async function publicBrowse(raw: unknown): Promise<PublicBrowse> {
  const parsed = browseInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Проверьте параметры каталога.");
  const input = parsed.data, context = tenant(), { organizationId } = context;
  if (Boolean(input.from) !== Boolean(input.until) || ((input.from || input.until) && !input.branchId)) throw new ShowroomError("Для проверки наличия выберите филиал, получение и возврат.");
  const branch = input.branchId ? await db.branch.findFirst({ where: { ...branches(organizationId), id: input.branchId }, select: { timezone: true } }) : null;
  if (input.branchId && !branch) throw new ShowroomError("Филиал недоступен.", 404);
  const dates = input.from && input.until && branch ? period(input.from, input.until, branch.timezone) : null;
  const selectedCategories = input.categoryId ? categoryIds(await publicCategories(), input.categoryId) : [];
  if (input.categoryId && !selectedCategories.length) throw new ShowroomError("Раздел больше недоступен.", 404);
  const where: Prisma.ProductVariantWhereInput = { AND: [variants(organizationId),
    input.search ? { product: { name: { contains: input.search, mode: "insensitive" } } } : {},
    input.categoryId ? { product: { categoryId: { in: selectedCategories }, category: { organizationId, status: "ACTIVE" } } } : {},
    input.size ? { size: { OR: [{ name: { equals: input.size, mode: "insensitive" } }, { code: { equals: input.size, mode: "insensitive" } }] } } : {}
  ] };
  await applyColorGroup(where, organizationId, input.colorGroup);
  const groups = await db.productVariant.groupBy({ by: ["productId", "executionId"], where,
    orderBy: [{ productId: "asc" }, { executionId: "asc" }], take: 13, skip: (input.page - 1) * 12 });
  const selected = groups.slice(0, 12);
  if (!selected.length) return { items: [], more: false, page: input.page };
  // Display metadata and size labels only; no financial fields, stock IDs or contacts.
  const products = await db.product.findMany({ where: { organizationId, id: { in: selected.map(g => g.productId) },
    variants: { some: where } }, select: { id: true, name: true, color: true,
      executions: { where: { organizationId, isActive: true, id: { in: selected.flatMap(g => g.executionId ? [g.executionId] : []) } }, select: { id: true, name: true } } } });
  const rows = await db.productVariant.findMany({ where: { AND: [where, { OR: selected.map(g => ({ productId: g.productId, executionId: g.executionId })) }] },
    select: { id: true, productId: true, executionId: true, size: { select: { name: true, code: true } } },
    orderBy: [{ size: { sortOrder: "asc" } }, { id: "asc" }], take: 257 });
  if (rows.length > 256) throw new ShowroomError("Слишком много размеров. Уточните размер или название.");
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
      sizes: [...new Set(rows.filter(r => r.productId === group.productId && r.executionId === group.executionId).map(r => r.size.name || r.size.code))],
      ...(dates ? { availableSizes: [...new Set(rows.filter(r => r.productId === group.productId && r.executionId === group.executionId && available.has(r.id)).map(r => r.size.name || r.size.code))] } : {}) });
  }
  return { items: await withPublicPhotos(organizationId, items), more: groups.length > 12 && input.page < 100, page: input.page };
}
export async function publicProduct(raw: unknown): Promise<PublicProductDetail> {
  const parsed = productInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Товар недоступен.", 404);
  const { organizationId } = tenant(), input = parsed.data;
  const rows = await db.productVariant.findMany({ where: { AND: [variants(organizationId), { productId: input.productId, executionId: input.executionId || null }] },
    select: { id: true, product: { select: { name: true, color: true } }, execution: { select: { name: true } }, size: { select: { name: true, code: true } } },
    orderBy: [{ size: { sortOrder: "asc" } }, { id: "asc" }], take: 257 });
  if (!rows.length) throw new ShowroomError("Товар больше недоступен в витрине.", 404);
  if (rows.length > 256) throw new ShowroomError("Выбор размеров временно недоступен.", 503);
  return { id: input.productId + ":" + (input.executionId || "default"), productId: input.productId, executionId: input.executionId || null,
    name: rows[0].product.name, color: rows[0].product.color, execution: rows[0].execution?.name ?? null,
    images: await publicPhotos(organizationId, { productId: input.productId, executionId: input.executionId || null, name: rows[0].product.name }),
    colorLabel: resolveCatalogColor(rows[0].execution?.name ?? null, rows[0].product.color).label,
    sizes: [...new Set(rows.map(row => row.size.name || row.size.code))],
    options: rows.map(row => ({ id: row.id, size: row.size.name || row.size.code, sizeCode: row.size.code })) };
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
  const { organizationId } = tenant();
  return readPublicPhoto(organizationId, raw);
}

// Revalidate an explicit outfit selection. Never trust client names/prices/category.
export async function publicSelectedCard(raw: unknown) {
  const input = selectionInput.parse(raw), { organizationId } = tenant();
  const row = await db.productVariant.findFirst({ where: { AND: [variants(organizationId), { id: input.variantId }] },
    select: { productId: true, executionId: true, product: { select: { categoryId: true } } } });
  if (!row) throw new ShowroomError("Выбранный товар больше недоступен.", 404);
  const item = await publicSelection(input);
  return { productId: row.productId, executionId: row.executionId, categoryId: row.product.categoryId,
    item, branchId: input.branchId, from: input.from, until: input.until };
}
