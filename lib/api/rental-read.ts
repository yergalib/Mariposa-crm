import "server-only";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requirePermission, PermissionError } from "@/lib/permissions/effective";
import { requireBranchAccess, accessibleBranchIds } from "@/lib/staff/branch-access";
import { StaffError } from "@/lib/staff/errors";
import { OrderError } from "@/lib/orders/errors";
import { ResourceNotFoundError, InvalidPeriodError, InvalidQuantityError } from "@/lib/availability/errors";
import { createTenantContext } from "@/lib/tenant/context";
import { parseRentalPeriodForBranch } from "@/lib/orders/rental-datetime";
import { quoteRentalVariant, searchRentalVariants, type RentalVariantQuote } from "@/lib/orders/mobile";
import { db } from "@/lib/db";
class ApiInputError extends Error {}
const inputSchema = z.object({ branchId: z.string().uuid(), rentalStart: z.string().max(30), rentalEnd: z.string().max(30), quantity: z.string().regex(/^[1-9]\d{0,3}$/).default("1").transform(Number).refine(n=>n<=1000), variantId: z.string().uuid().optional(), q: z.string().trim().max(100).refine(s=>(s.match(/[\p{L}\p{N}]/gu)??[]).length>=3).optional() }).strict().refine(value=>Boolean(value.variantId)!==Boolean(value.q));
function parameters(request: Request) { if (request.url.length > 4096) throw new ApiInputError(); const params = new URL(request.url).searchParams; for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new ApiInputError(); return Object.fromEntries(params); }
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
function json(value: unknown, status = 200) { return Response.json(value, { status, headers }); }
export function safeRentalQuote(row: RentalVariantQuote) { return { variantId: row.variantId, sku: row.sku, trackingMode: row.trackingMode, product: { id: row.product.id, name: row.product.name, code: row.product.code }, execution: row.execution ? { id: row.execution.id, name: row.execution.name } : null, size: { code: row.size.code, name: row.size.name, sizeSystem: row.size.sizeSystem, recommendedHeightCm: row.size.recommendedHeightCm, lengthCm: row.size.lengthCm }, priceMinor: row.priceMinor, currency: row.currency, availableCapacity: row.availableCapacity, requestedQuantity: row.requestedQuantity, canFulfill: row.canFulfill }; }
export async function rentalReadApi(request: Request, mode: "branches" | "availability") {
  try {
    const actor = await getCurrentSession();
    if (!actor) return json({ error: { code: "UNAUTHORIZED" } }, 401);
    await Promise.all([requirePermission(actor,"ORDER_CREATE"),requirePermission(actor,"CATALOG_VIEW"),requirePermission(actor,"INVENTORY_VIEW")]);
    const tenant = createTenantContext(actor.organizationId), raw = parameters(request);
    if (mode === "branches") {
      if (Object.keys(raw).length) throw new ApiInputError();
      const allowed = await accessibleBranchIds(tenant, actor.membershipId);
      const rows = await db.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", ...(allowed ? { id: { in: allowed } } : {}) }, select: { id: true, name: true, timezone: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
      return json({ version: 1, data: rows.map(row=>({id:row.id,name:row.name,timeZone:row.timezone})) });
    }
    const input = inputSchema.parse(raw);
    await requireBranchAccess(tenant, actor.membershipId, input.branchId);
    const period = await parseRentalPeriodForBranch(tenant,input);
    const context = { branchId: input.branchId, requestedFrom: period.rentalStart, requestedUntil: period.rentalEnd, quantity: input.quantity };
    const rows = input.variantId ? [await quoteRentalVariant(tenant,input.variantId,context)].filter((row): row is RentalVariantQuote=>row!==null) : await searchRentalVariants(tenant,input.q!,context);
    if (input.variantId && !rows.length) return json({ error: { code: "NOT_FOUND" } },404);
    return json({ version: 1, observedAt: new Date().toISOString(), period: { from: period.rentalStart.toISOString(), until: period.rentalEnd.toISOString(), timeZone: period.timeZone }, reservationCreated: false, limit: input.variantId ? 1 : 24, data: rows.map(safeRentalQuote) });
  } catch (error) {
    if (error instanceof PermissionError || error instanceof StaffError || error instanceof OrderError && error.code === "FORBIDDEN") return json({error:{code:"FORBIDDEN"}},403);
    if (error instanceof ResourceNotFoundError || error instanceof OrderError && error.code === "NOT_FOUND") return json({error:{code:"NOT_FOUND"}},404);
    if (error instanceof z.ZodError || error instanceof ApiInputError || error instanceof OrderError || error instanceof InvalidPeriodError || error instanceof InvalidQuantityError) return json({error:{code:"INVALID_REQUEST"}},400);
    return json({error:{code:"SERVICE_UNAVAILABLE"}},503);
  }
}
