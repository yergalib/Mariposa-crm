import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { WarehouseNav } from "@/components/WarehouseNav";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission, hasPermission } from "@/lib/permissions/effective";
import { getInventoryMovements } from "@/lib/inventory/movements";
import { MOVEMENT_LABELS } from "@/lib/inventory/movement-labels";
import { createTenantContext } from "@/lib/tenant/context";
import { InventoryMovementType } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; branch?: string; cursor?: string }> }) {
  const session = await requireRouteAccess("/warehouse/movements");
  await requirePermission(session, "INVENTORY_VIEW");
  const params = await searchParams;
  const type = Object.values(InventoryMovementType).includes(params.type as InventoryMovementType) ? params.type as InventoryMovementType : undefined;
  const allowed = session.hasOrganizationWideBranchAccess ? null : session.allowedBranchIds;
  const [branches, canExport] = await Promise.all([
    db.branch.findMany({ where: { organizationId: session.organizationId, id: allowed ? { in: allowed } : undefined }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    hasPermission(session, "INVENTORY_EXPORT"),
  ]);
  const branch = typeof params.branch === "string" ? params.branch : "";
  const validBranch = !branch || branches.some(row => row.id === branch);
  const cursor = /^[0-9a-f-]{36}$/i.test(params.cursor ?? "") ? params.cursor : undefined;
  const rows = validBranch ? await getInventoryMovements(createTenantContext(session.organizationId), { search: params.q, type, branchId: branch || undefined, cursor, take: 50, allowedBranchIds: allowed }) : [];
  const filters = new URLSearchParams();
  if (params.q) filters.set("q", params.q);
  if (type) filters.set("type", type);
  if (branch) filters.set("branch", branch);
  const next = new URLSearchParams(filters);
  if (rows[49]) next.set("cursor", rows[49].id);
  return <AppShell active="/warehouse" title="История склада" subtitle="Физические движения: поступления, выдачи, возвраты и изменения остатков">
    <WarehouseNav active="/warehouse/movements"/>
    <form method="get" className="toolbar warehouse-filters">
      <label>Товар или код<input name="q" defaultValue={params.q} placeholder="Название, код или номер экземпляра"/></label>
      <label>Операция<select name="type" defaultValue={type ?? ""}><option value="">Все операции</option>{Object.values(InventoryMovementType).map(value => <option key={value} value={value}>{MOVEMENT_LABELS[value] ?? value}</option>)}</select></label>
      <label>Филиал<select name="branch" defaultValue={branch}><option value="">Все доступные филиалы</option>{branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <button className="secondary">Применить</button>
      {canExport && <a className="button secondary" href={`/warehouse/movements/export?${filters}`}>Excel истории</a>}
    </form>
    {!validBranch && <p className="notice error">Филиал недоступен.</p>}
    <p className="muted">Перемещение показывает количество перенесённых единиц, а не изменение общего остатка. Время — UTC.</p>
    <section className="card">
      {!rows.length ? <p className="inventory-empty">Движений по выбранным условиям нет.</p> : <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-history-table">
        <thead><tr>{["Дата / операция", "Товар / размер", "Количество", "Откуда", "Куда", "Сотрудник / причина"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 50).map(row => <tr key={row.id}>
          <td data-label="Дата / операция">{row.occurredAt.toLocaleString("ru-RU", { timeZone: "UTC" })}<small>{MOVEMENT_LABELS[row.type] ?? row.type}</small></td>
          <td data-label="Товар / размер"><Link href={`/products/${row.productVariant.productId}`}>{row.productVariant.product.name}</Link><small>{row.productVariant.size.code} · {row.productVariant.sku}</small>{row.productInstance && <small>{row.productInstance.inventoryNumber}</small>}</td>
          <td data-label="Количество">{row.quantity}</td>
          <td data-label="Откуда">{row.fromBranch?.name ?? "—"}<small>{row.fromLocation?.name}</small></td>
          <td data-label="Куда">{row.toBranch?.name ?? "—"}<small>{row.toLocation?.name}</small></td>
          <td data-label="Сотрудник / причина">{row.createdBy?.displayName ?? "Система"}<small>{row.reason || "—"}</small></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <p><Link href="/warehouse/operations">Другие складские операции и корректировки</Link></p>
    <nav className="toolbar" aria-label="Страницы истории">
      {cursor && <Link className="button secondary" href={`/warehouse/movements?${filters}`}>К началу</Link>}
      {rows.length > 50 && <Link className="button secondary" href={`/warehouse/movements?${next}`}>Следующие 50</Link>}
    </nav>
  </AppShell>;
}
