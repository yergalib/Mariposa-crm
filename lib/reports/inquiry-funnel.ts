import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { workflowScope } from "@/lib/workflow-access";
import { financePeriod } from "@/lib/finance/filters";
import { SOURCE_LABELS } from "@/lib/inquiries/validation";
export type FunnelFilters = { from?: string; until?: string; branchId?: string; source?: string; page?: string };
export async function getInquiryFunnel(actor: AuthContext, raw: FunnelFilters) {
  if (raw.branchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.branchId)) throw Error("Некорректный филиал.");
  if (raw.source && !Object.hasOwn(SOURCE_LABELS, raw.source)) throw Error("Некорректный источник.");
  const period = financePeriod(raw), asOf = new Date();
  return db.$transaction(async tx => {
    const access = await workflowScope(tx, actor, ["REPORT_FINANCE_VIEW", "LEAD_VIEW", "FITTING_VIEW", "ORDER_VIEW"], raw.branchId);
    if (!["OWNER", "DIRECTOR"].includes(access.member.role)) throw Error("Воронка доступна владельцу и директору с правами на отчёты, обращения, примерки и заказы.");
    const scope = { ...access.where, branchId: raw.branchId || access.where.branchId };
    const branches = await tx.branch.findMany({ where: { organizationId: actor.organizationId, status: "ACTIVE", id: access.where.branchId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const cohort = await tx.inquiry.findMany({ where: { ...scope, source: raw.source as keyof typeof SOURCE_LABELS || undefined, createdAt: { gte: period.from, lt: new Date(Math.min(period.endExclusive.getTime(), asOf.getTime())) } }, select: { id: true, subject: true, source: true, createdAt: true, orderId: true, branch: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5001 });
    if (cohort.length > 5000) return { available: false as const, period, asOf, branches, reason: "В выбранной группе более 5000 обращений. Сузьте период, филиал или источник; частичные проценты не рассчитываются." };
    const fittings = cohort.length ? await tx.fitting.findMany({ where: { ...scope, inquiryId: { in: cohort.map(row => row.id) }, createdAt: { lte: asOf } }, select: { id: true, inquiryId: true, orderId: true, startsAt: true } }) : [];
    const orderIds = [...new Set([...cohort.flatMap(row => row.orderId ? [row.orderId] : []), ...fittings.flatMap(row => row.orderId ? [row.orderId] : [])])];
    const orders = orderIds.length ? await tx.order.findMany({ where: { ...scope, id: { in: orderIds }, createdAt: { lte: asOf } }, select: { id: true, orderNumber: true } }) : [];
    const orderMap = new Map(orders.map(row => [row.id, row]));
    const fittingMap = new Map<string, typeof fittings>();
    for (const fitting of fittings) if (fitting.inquiryId) { const rows = fittingMap.get(fitting.inquiryId) ?? []; rows.push(fitting); fittingMap.set(fitting.inquiryId, rows); }
    const rows = cohort.map(row => {
      const linked = fittingMap.get(row.id) ?? [], linkedOrderIds = new Set([...(row.orderId ? [row.orderId] : []), ...linked.flatMap(f => f.orderId ? [f.orderId] : [])]);
      return { id: row.id, subject: row.subject, source: row.source, createdAt: row.createdAt, branch: row.branch.name, fittings: linked.map(f => ({ id: f.id, startsAt: f.startsAt })), orders: [...linkedOrderIds].flatMap(id => orderMap.has(id) ? [orderMap.get(id)!] : []), throughFitting: linked.some(f => f.orderId && orderMap.has(f.orderId)) };
    });
    const total = rows.length, withFitting = rows.filter(r => r.fittings.length).length, withOrder = rows.filter(r => r.orders.length).length, throughFitting = rows.filter(r => r.throughFitting).length;
    const pages = Math.max(1, Math.ceil(total / 50)), page = Math.min(pages, /^\d{1,7}$/.test(raw.page ?? "") ? Math.max(1, Number(raw.page)) : 1);
    return { available: true as const, period, asOf, branches, total, withFitting, withOrder, throughFitting, fittingCount: fittings.length, orderCount: orders.length, rows: rows.slice((page - 1) * 50, page * 50), pages, page };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
