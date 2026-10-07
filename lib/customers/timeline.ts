import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";
import { canAccessRoute } from "@/lib/auth/access";
import { workflowScope, permits } from "@/lib/workflow-access";
import { ORDER_EVENT_LABELS, ORDER_STATUS_LABELS } from "@/lib/ui/labels";
import { FITTING_STATUS_LABELS } from "@/lib/fittings/validation";
import { STATUS_LABELS as INQUIRY_STATUS_LABELS } from "@/lib/inquiries/validation";
import { CustomerOrderActivityError, readCustomerOrderActivityFilters } from "./order-activity";

export const TIMELINE_CATEGORIES = { CLIENT: "Клиент", ORDER: "Заказы", INQUIRY: "Обращения", FITTING: "Примерки", TASK: "Задачи", PAYMENT: "Платежи и возвраты", DEPOSIT: "Залоги", NOTE: "Заметки" } as const;
type Category = keyof typeof TIMELINE_CATEGORIES;
export type TimelineFilters = { from?: string; to?: string; category?: Category; type?: "RENTAL" | "SALE"; cursor?: string };
type Cursor = { at: string; key: string; scope: string };
type Entry = { key: string; at: string; recordedAt?: string; category: Category; code: string; href: string; label: string; branch?: string;
  status?: string; previousStatus?: string; text?: string; editedAt?: string; amount?: string; currency?: string };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const statuses: Partial<Record<Category, Record<string,string>>> = { ORDER: ORDER_STATUS_LABELS, INQUIRY: INQUIRY_STATUS_LABELS, FITTING: FITTING_STATUS_LABELS,
  TASK: { OPEN: "Открыта", IN_PROGRESS: "В работе", DONE: "Завершена", CANCELLED: "Отменена" } };
const labels: Record<string,string> = { ...ORDER_EVENT_LABELS, CLIENT_CREATED: "Карточка клиента создана в CRM", NOTE_CREATED: "Добавлена внутренняя заметка",
  ORDER_RECORD_CREATED: "Запись заказа создана", INQUIRY_RECORD_CREATED: "Запись обращения создана", FITTING_RECORD_CREATED: "Запись примерки создана", TASK_RECORD_CREATED: "Запись задачи создана",
  INQUIRY_CREATED: "Обращение создано", INQUIRY_UPDATED: "Обращение изменено", FITTING_CREATED: "Примерка назначена", FITTING_UPDATED: "Примерка изменена",
  TASK_CREATED: "Задача создана", TASK_UPDATED: "Условия задачи изменены", TASK_STATUS_CHANGED: "Статус задачи изменён",
  PAYMENT_RECEIVED: "Получена оплата", CUSTOMER_REFUND: "Деньги возвращены клиенту", DEPOSIT_RECEIVED: "Залог принят", DEPOSIT_REFUNDED: "Залог возвращён", DEPOSIT_WITHHELD: "Удержано из залога",
  REVERSE_PAYMENT_RECEIVED: "Оплата отменена обратной записью", REVERSE_CUSTOMER_REFUND: "Возврат денег отменён обратной записью",
  REVERSE_DEPOSIT_RECEIVED: "Приём залога отменён обратной записью", REVERSE_DEPOSIT_REFUNDED: "Возврат залога отменён обратной записью", REVERSE_DEPOSIT_WITHHELD: "Удержание отменено обратной записью" };
export function timelineEventLabel(code: string) { return labels[code] ?? "Сохранённое событие"; }
export function timelineStatusLabel(category: Category, value: string) { return statuses[category]?.[value] ?? ""; }

export function readCustomerTimelineFilters(raw: Record<string, string | string[] | undefined>): TimelineFilters {
  for (const [key, value] of Object.entries(raw)) if (value !== undefined && (!['from', 'to', 'type', 'category', 'cursor'].includes(key) || typeof value !== "string")) throw new CustomerOrderActivityError();
  const dates = readCustomerOrderActivityFilters({ from: raw.from, to: raw.to, type: raw.type });
  const category = raw.category || (dates.type ? "ORDER" : undefined);
  if (category && !Object.hasOwn(TIMELINE_CATEGORIES, category as string) || dates.type && category !== "ORDER") throw new CustomerOrderActivityError();
  return { ...dates, category: category as Category | undefined, cursor: raw.cursor as string || undefined };
}
function scopeKey(customerId: string, filters: TimelineFilters) { return JSON.stringify([customerId, filters.from ?? "", filters.to ?? "", filters.category ?? "", filters.type ?? ""]); }
function readCursor(value: string | undefined, scope: string): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 1500 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const c = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (c.scope !== scope || typeof c.at !== "string" || !Number.isFinite(Date.parse(c.at)) || typeof c.key !== "string" || !/^[a-z-]+:[0-9a-f-]{36}$/.test(c.key)) throw new Error();
    return c;
  } catch { throw new CustomerOrderActivityError("Страница не соответствует клиенту или фильтрам. Начните ленту заново."); }
}
export function customerTimelineHref(customerId: string, filters: TimelineFilters, cursor?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && key !== "cursor") params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return `/customers/${customerId}/activity${params.size ? `?${params}` : ""}`;
}

/** Read-only projection of persisted facts, never a backfilled event store. */
export async function getCustomerTimeline(actor: AuthContext, customerId: string, filters: TimelineFilters) {
  const { member, where } = await db.$transaction(tx => workflowScope(tx, actor, ["CUSTOMER_VIEW"]));
  if (!uuid.test(customerId)) return null;
  const customer = await db.customer.findFirst({ where: { organizationId: actor.organizationId, id: customerId }, select: { id: true, customerNumber: true, firstName: true, lastName: true } });
  if (!customer) return null;
  const scope = scopeKey(customerId, filters), cursor = readCursor(filters.cursor, scope);
  const branchIds = where.branchId?.in ?? null;
  // UUID casts belong to each parameter, not to an entire IN expression.
  const branches = (column: Prisma.Sql) => branchIds === null ? Prisma.sql`TRUE` : branchIds.length ? Prisma.sql`${column} IN (${Prisma.join(branchIds.map(id => Prisma.sql`${id}::uuid`))})` : Prisma.sql`FALSE`;
  const can = (route: string, key: Parameters<typeof permits>[1]) => canAccessRoute(member.role, route) && permits(member, key);
  const allowed: Category[] = ["CLIENT", "NOTE"];
  if (can("/orders", "ORDER_VIEW")) allowed.push("ORDER");
  if (can("/chats", "LEAD_VIEW")) allowed.push("INQUIRY");
  if (can("/fittings", "FITTING_VIEW")) allowed.push("FITTING");
  if (can("/tasks", "TASK_VIEW")) allowed.push("TASK");
  if (permits(member, "PAYMENT_VIEW")) allowed.push("PAYMENT");
  if (permits(member, "DEPOSIT_VIEW")) allowed.push("DEPOSIT");
  if (filters.category && !allowed.includes(filters.category)) throw new CustomerOrderActivityError("Этот вид событий недоступен.");
  const show = (category: Category) => allowed.includes(category) && (!filters.category || filters.category === category);
  const org = actor.organizationId;
  const ctes = Prisma.sql`
    scoped_orders AS (
      SELECT o.id, o.order_number AS label, o.type, o.branch_id, o.created_at, b.name AS branch
      FROM orders o JOIN branches b ON b.id=o.branch_id AND b.organization_id=o.organization_id
      WHERE o.organization_id=${org}::uuid AND o.customer_id=${customerId}::uuid AND ${allowed.includes("ORDER")} AND ${branches(Prisma.sql`o.branch_id`)}
    ), scoped_inquiries AS (
      SELECT i.id, i.subject AS label, i.branch_id, i.created_at, b.name AS branch
      FROM inquiries i JOIN branches b ON b.id=i.branch_id AND b.organization_id=i.organization_id AND b.status='ACTIVE'
      WHERE i.organization_id=${org}::uuid AND ${allowed.includes("INQUIRY")} AND ${branches(Prisma.sql`i.branch_id`)}
      AND (i.customer_id=${customerId}::uuid OR (i.customer_id IS NULL AND EXISTS (SELECT 1 FROM scoped_orders o WHERE o.id=i.order_id AND o.branch_id=i.branch_id)))
    ), scoped_fittings AS (
      SELECT f.id, 'Примерка'::text AS label, f.branch_id, f.created_at, b.name AS branch
      FROM fittings f JOIN branches b ON b.id=f.branch_id AND b.organization_id=f.organization_id
      WHERE f.organization_id=${org}::uuid AND ${allowed.includes("FITTING")} AND ${branches(Prisma.sql`f.branch_id`)}
      AND (f.customer_id=${customerId}::uuid OR (f.customer_id IS NULL AND (
        EXISTS (SELECT 1 FROM scoped_orders o WHERE o.id=f.order_id AND o.branch_id=f.branch_id) OR
        EXISTS (SELECT 1 FROM scoped_inquiries i WHERE i.id=f.inquiry_id AND i.branch_id=f.branch_id))))
    ), scoped_tasks AS (
      SELECT t.id, t.title AS label, t.branch_id, t.created_at, b.name AS branch
      FROM staff_tasks t JOIN branches b ON b.id=t.branch_id AND b.organization_id=t.organization_id AND b.status='ACTIVE'
      WHERE t.organization_id=${org}::uuid AND ${allowed.includes("TASK")} AND ${branches(Prisma.sql`t.branch_id`)}
      AND (${member.role !== "SELLER"} OR t.assigned_membership_id=${actor.membershipId}::uuid)
      AND (t.customer_id=${customerId}::uuid OR (t.customer_id IS NULL AND EXISTS (SELECT 1 FROM scoped_orders o WHERE o.id=t.order_id AND o.branch_id=t.branch_id)))
    )`;
  const parts: Prisma.Sql[] = [];
  if (show("CLIENT")) parts.push(Prisma.sql`SELECT c.created_at AS at, 'client:'||c.id AS key,
    jsonb_build_object('category','CLIENT','code','CLIENT_CREATED','href','/customers/'||c.id,'label',c.customer_number) AS entry
    FROM customers c WHERE c.organization_id=${org}::uuid AND c.id=${customerId}::uuid`);
  if (show("NOTE")) parts.push(Prisma.sql`SELECT n.created_at AS at, 'note:'||n.id AS key,
    jsonb_build_object('category','NOTE','code','NOTE_CREATED','href','/customers/'||n.customer_id||'#note-'||n.id,'label','Заметка клиента','text',n.text,'editedAt',n.updated_at) AS entry
    FROM customer_notes n WHERE n.organization_id=${org}::uuid AND n.customer_id=${customerId}::uuid AND n.archived_at IS NULL`);
  if (show("ORDER")) {
    const type = filters.type ? Prisma.sql`o.type::text=${filters.type}` : Prisma.sql`TRUE`;
    parts.push(Prisma.sql`SELECT e.created_at AS at, 'order-event:'||e.id AS key,
      jsonb_build_object('category','ORDER','code',e.event_type,'href','/orders/'||o.id,'label',o.label,'branch',o.branch,'previousStatus',e.from_status,'status',e.to_status) AS entry
      FROM order_events e JOIN scoped_orders o ON o.id=e.order_id WHERE e.organization_id=${org}::uuid AND ${type}
      AND e.event_type IN (${Prisma.join(Object.keys(ORDER_EVENT_LABELS))})
      AND (e.event_type NOT IN ('CREATED','SALE_DRAFT_CREATED') OR NOT EXISTS (
        SELECT 1 FROM order_events prior WHERE prior.organization_id=e.organization_id AND prior.order_id=e.order_id
        AND prior.event_type IN ('CREATED','SALE_DRAFT_CREATED') AND (prior.created_at,prior.id)<(e.created_at,e.id)))`);
    parts.push(Prisma.sql`SELECT o.created_at AS at, 'order-record:'||o.id AS key,
      jsonb_build_object('category','ORDER','code','ORDER_RECORD_CREATED','href','/orders/'||o.id,'label',o.label,'branch',o.branch) AS entry
      FROM scoped_orders o WHERE ${type} AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.organization_id=${org}::uuid AND e.order_id=o.id AND e.event_type IN ('CREATED','SALE_DRAFT_CREATED'))`);
  }
  // Only source-specific business actions. Generic audit payloads, reasons and
  // duplicate financial/order/conversion audit entries never enter the DTO.
  for (const [category, table, entity, actions, route] of [
    ["INQUIRY", "scoped_inquiries", "Inquiry", ["INQUIRY_CREATED", "INQUIRY_UPDATED"], "/chats/"],
    ["FITTING", "scoped_fittings", "Fitting", ["FITTING_CREATED", "FITTING_UPDATED"], "/fittings/"],
    ["TASK", "scoped_tasks", "StaffTask", ["TASK_CREATED", "TASK_UPDATED", "TASK_STATUS_CHANGED"], "/tasks/"],
  ] as const) {
    if (!show(category)) continue;
    const source = Prisma.raw(table), created = actions[0], types = [entity, entity.toUpperCase()];
    parts.push(Prisma.sql`SELECT a.occurred_at AS at, 'audit:'||a.id AS key,
      jsonb_build_object('category',${category}::text,'code',a.action,'href',${route}::text||s.id,'label',s.label,'branch',b.name,
        'status',a.metadata->>'status','previousStatus',a.metadata->>'previousStatus','recordedAt',a.created_at) AS entry
      FROM audit_logs a JOIN ${source} s ON a.entity_id=s.id::text
      LEFT JOIN branches b ON b.id=a.branch_id AND b.organization_id=a.organization_id
      WHERE a.organization_id=${org}::uuid AND a.entity_type IN (${Prisma.join(types)}) AND a.result='SUCCESS'
      AND a.action IN (${Prisma.join(actions)}) AND ${branches(Prisma.sql`a.branch_id`)}
      AND (a.action<>${created} OR NOT EXISTS (SELECT 1 FROM audit_logs prior
        WHERE prior.organization_id=a.organization_id AND prior.entity_type IN (${Prisma.join(types)}) AND prior.entity_id=a.entity_id
        AND prior.result='SUCCESS' AND prior.action=${created} AND (prior.occurred_at,prior.id)<(a.occurred_at,a.id)))`);
    parts.push(Prisma.sql`SELECT s.created_at AS at, ${category.toLowerCase()+"-record:"}::text||s.id AS key,
      jsonb_build_object('category',${category}::text,'code',${category+"_RECORD_CREATED"}::text,'href',${route}::text||s.id,'label',s.label,'branch',s.branch) AS entry
      FROM ${source} s WHERE NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.organization_id=${org}::uuid AND a.entity_type IN (${Prisma.join(types)})
        AND a.entity_id=s.id::text AND a.result='SUCCESS' AND a.action=${created})`);
  }
  for (const category of ["PAYMENT", "DEPOSIT"] as const) {
    if (!show(category)) continue;
    const kinds = category === "PAYMENT" ? ["PAYMENT_RECEIVED", "CUSTOMER_REFUND"] : ["DEPOSIT_RECEIVED", "DEPOSIT_REFUNDED", "DEPOSIT_WITHHELD"];
    parts.push(Prisma.sql`SELECT f.occurred_at AS at, 'finance:'||f.id AS key,
      jsonb_build_object('category',${category}::text,'code',CASE WHEN f.kind='REVERSAL' THEN 'REVERSE_'||original.kind::text ELSE f.kind::text END,
        'href',CASE WHEN o.id IS NOT NULL THEN '/orders/'||o.id ELSE '/customers/'||f.customer_id||${category === "PAYMENT" ? "/finance/payments" : "/finance/deposits"}::text END,
        'label',COALESCE(o.label,'Операция клиента'),'branch',b.name,'amount',f.amount_minor::text,'currency',f.currency,'recordedAt',f.created_at) AS entry
      FROM financial_transactions f JOIN branches b ON b.id=f.branch_id AND b.organization_id=f.organization_id
      LEFT JOIN scoped_orders o ON o.id=f.order_id AND o.branch_id=f.branch_id
      LEFT JOIN financial_transactions original ON original.id=f.reversal_of_id AND original.organization_id=f.organization_id
        AND original.customer_id=f.customer_id AND original.branch_id=f.branch_id
      WHERE f.organization_id=${org}::uuid AND f.customer_id=${customerId}::uuid AND ${branches(Prisma.sql`f.branch_id`)}
        AND (f.kind::text IN (${Prisma.join(kinds)}) OR (f.kind='REVERSAL' AND original.kind::text IN (${Prisma.join(kinds)})))`);
  }
  const from = filters.from ? new Date(filters.from+"T00:00:00Z") : null;
  const until = filters.to ? new Date(new Date(filters.to+"T00:00:00Z").getTime()+86400000) : null;
  const records = await db.$queryRaw<Array<{ at: Date; key: string; entry: Omit<Entry, "at" | "key"> }>>(Prisma.sql`
    WITH ${ctes}, events AS (${Prisma.join(parts, " UNION ALL ")})
    SELECT at,key,entry FROM events WHERE ${from ? Prisma.sql`at>=${from}` : Prisma.sql`TRUE`} AND ${until ? Prisma.sql`at<${until}` : Prisma.sql`TRUE`}
      AND ${cursor ? Prisma.sql`(at,key COLLATE "C")<(${new Date(cursor.at)},${cursor.key} COLLATE "C")` : Prisma.sql`TRUE`}
    ORDER BY at DESC,key COLLATE "C" DESC LIMIT 51`);
  const rows: Entry[] = records.slice(0,50).map(row => {
    const { status, previousStatus, ...entry } = row.entry;
    const safe = (value: unknown) => typeof value === "string" && Object.hasOwn(statuses[entry.category] ?? {}, value) ? value : undefined;
    return { ...entry, status: safe(status), previousStatus: safe(previousStatus), key: row.key, at: row.at.toISOString() };
  });
  const last = rows.at(-1);
  return { customer, rows, allowed, nextCursor: records.length>50 && last ? Buffer.from(JSON.stringify({ at:last.at,key:last.key,scope })).toString("base64url") : null };
}
