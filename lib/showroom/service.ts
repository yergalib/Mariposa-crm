import "server-only";
import { assertPilotOrganization } from "@/lib/tenant/pilot-preview";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createTenantContext } from "@/lib/tenant/context";
import { parseBusinessLocalDateTime } from "@/lib/calendar/timezone";
import { getVariantAvailability } from "@/lib/availability/capacity";
import { appendAuditLog } from "@/lib/audit/log";
import { publicInquiryInput, searchInput, type PublicBranch, type PublicCatalog, type PublicVariant } from "./contracts";

export class ShowroomError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
function tenant() {
  // Explicit server binding. No URL, body, cookie or client-supplied tenant fallback.
  const id = process.env.STOREFRONT_ORGANIZATION_ID;
  if (!z.string().uuid().safeParse(id).success) throw new ShowroomError("Витрина пока недоступна.", 503);
  assertPilotOrganization(id!);
  return createTenantContext(id!);
}
function branches(organizationId: string) {
  return { organizationId, isPublic: true, status: "ACTIVE" as const, organization: { status: "ACTIVE" as const } };
}
function variants(organizationId: string): Prisma.ProductVariantWhereInput {
  return { organizationId, isActive: true,
    product: { organizationId, showOnWebsite: true, publicationStatus: "ACTIVE", archivedAt: null, isRentable: true },
    size: { organizationId, isActive: true },
    OR: [{ executionId: null }, { execution: { organizationId, isActive: true } }]
  };
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
export async function publicCatalog(raw: unknown): Promise<PublicCatalog> {
  const parsed = searchInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Проверьте филиал, размер и даты.");
  const input = parsed.data, context = tenant(), organizationId = context.organizationId;
  const branch = await db.branch.findFirst({ where: { ...branches(organizationId), id: input.branchId }, select: { timezone: true } });
  if (!branch) throw new ShowroomError("Филиал недоступен.", 404);
  const { from, until } = period(input.from, input.until, branch.timezone), now = new Date();
  const where: Prisma.ProductVariantWhereInput = { AND: [variants(organizationId),
    input.search ? { product: { name: { contains: input.search, mode: "insensitive" } } } : {},
    input.size ? { size: { OR: [{ name: { equals: input.size, mode: "insensitive" } }, { code: { equals: input.size, mode: "insensitive" } }] } } : {}
  ] };
  // Page model/execution keys in SQL before loading their sizes. Labels are not IDs.
  const groups = await db.productVariant.groupBy({ by: ["productId", "executionId"], where,
    orderBy: [{ productId: "asc" }, { executionId: "asc" }], take: 9, skip: (input.page - 1) * 8 });
  const pageGroups = groups.slice(0, 8);
  if (!pageGroups.length) return { items: [], more: false, page: input.page };
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
  const options = new Map<string, PublicVariant>();
  for (let offset = 0; offset < rows.length; offset += 2) {
    const batch = await Promise.all(rows.slice(offset, offset + 2).map(async row => {
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
    const members = rows.filter(row => row.productId === group.productId && row.executionId === group.executionId);
    const first = members[0];
    if (!first) continue; // Publication may change between the two reads.
    items.push({ id: group.productId + ":" + (group.executionId ?? "default"), productId: group.productId, executionId: group.executionId,
      name: first.product.name, execution: first.execution?.name ?? null, color: first.product.color,
      variants: members.map(row => options.get(row.id)!) });
  }
  return { items, more: groups.length > 8 && input.page < 100, page: input.page };
}

export async function submitPublicInquiry(raw: unknown): Promise<void> {
  const parsed = publicInquiryInput.safeParse(raw);
  if (!parsed.success) throw new ShowroomError("Проверьте форму и контакт: телефон или email.");
  const input = parsed.data, { organizationId } = tenant();
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  // Shared database lock makes limits and idempotency work across server processes.
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`showroom:${organizationId}`}, 0))`;
    const branch = await tx.branch.findFirst({ where: { ...branches(organizationId), id: input.branchId }, select: { timezone: true } });
    const variant = await tx.productVariant.findFirst({ where: { AND: [variants(organizationId), { id: input.variantId }] },
      select: { id: true, sku: true, product: { select: { name: true } }, size: { select: { name: true, code: true } } } });
    if (!branch || !variant) throw new ShowroomError("Товар или филиал больше недоступен. Обновите витрину.", 404);
    const previous = await tx.inquiry.findUnique({ where: { organizationId_creationKey: { organizationId, creationKey: input.creationKey } },
      select: { creationHash: true, source: true, createdByUserId: true } });
    if (previous) {
      if (previous.creationHash !== hash || previous.source !== "WEBSITE" || previous.createdByUserId !== null)
        throw new ShowroomError("Форма изменилась. Начните новую заявку.", 409);
      return;
    }
    const { from, until } = period(input.from, input.until, branch.timezone);
    const recent = { organizationId, source: "WEBSITE" as const, createdByUserId: null, createdAt: { gte: new Date(Date.now() - 3600000) } };
    const total = await tx.inquiry.count({ where: recent });
    const perContact = await tx.inquiry.count({ where: { ...recent, replyContact: input.replyContact } });
    if (total >= 30 || perContact >= 3) throw new ShowroomError("Слишком много заявок. Попробуйте позже.", 429);
    const inquiry = await tx.inquiry.create({ data: {
      organizationId, branchId: input.branchId, source: "WEBSITE", createdByUserId: null,
      subject: `Заявка с сайта: ${variant.product.name}`.slice(0, 200), replyContact: input.replyContact,
      requestedFrom: from, requestedUntil: until, requestedSize: (variant.size.name || variant.size.code).slice(0, 100),
      creationKey: input.creationKey, creationHash: hash,
      items: { create: [{ organizationId, productVariantId: variant.id, nameSnapshot: variant.product.name,
        sizeSnapshot: variant.size.name || variant.size.code, skuSnapshot: variant.sku }] }
    }, select: { id: true } });
    await appendAuditLog(tx, { organizationId, branchId: input.branchId, action: "INQUIRY_CREATED", source: "API",
      entityType: "Inquiry", entityId: inquiry.id, metadata: { sourceType: "WEBSITE", itemCount: 1 } });
  }, { timeout: 10000 });
}
