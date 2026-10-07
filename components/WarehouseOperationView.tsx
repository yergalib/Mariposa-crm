import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { WarehouseNav } from "@/components/WarehouseNav";
import { WarehouseOperationForm, type WarehouseOperation } from "@/components/WarehouseOperationForm";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission, requirePermission } from "@/lib/permissions/effective";
import { db } from "@/lib/db";

const titles = { receipts: "Приход", transfers: "Перемещения", "write-offs": "Списания" };
const types = { receipts: "RECEIPT", transfers: "TRANSFER", "write-offs": "WRITE_OFF" };
export async function WarehouseOperationView({ operation, searchParams }: { operation: WarehouseOperation; searchParams: Promise<{ ok?: string; q?: string }> }) {
  const session = await requireRouteAccess("/warehouse");
  await requirePermission(session, "INVENTORY_VIEW");
  const params = await searchParams;
  const permitted = await hasPermission(session, operation === "receipts" ? "INVENTORY_RECEIVE" : operation === "transfers" ? "INVENTORY_TRANSFER" : "INVENTORY_WRITE_OFF");
  const canOperate = permitted && (operation !== "write-offs" || await hasPermission(session, "INVENTORY_ADJUST"));
  const scope = session.hasOrganizationWideBranchAccess ? undefined : { in: session.allowedBranchIds };
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const [variants, branches, locations, instances] = canOperate ? await Promise.all([
    db.productVariant.findMany({ where: { organizationId: session.organizationId, isActive: true, product: { publicationStatus: { not: "ARCHIVED" }, archivedAt: null },
      ...(query ? { OR: [{ sku: { contains: query, mode: "insensitive" } }, { product: { name: { contains: query, mode: "insensitive" } } }] } : {}) },
      select: { id: true, sku: true, product: { select: { name: true, trackingMode: true } }, size: { select: { code: true } } },
      orderBy: [{ product: { trackingMode: "asc" } }, { sku: "asc" }, { id: "asc" }], take: 201 }),
    db.branch.findMany({ where: { organizationId: session.organizationId, status: "ACTIVE", id: scope }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.location.findMany({ where: { organizationId: session.organizationId, isActive: true, branchId: scope }, select: { id: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
    operation === "receipts" ? Promise.resolve([]) : db.productInstance.findMany({ where: { organizationId: session.organizationId, currentBranchId: scope, operationalStatus: "AVAILABLE", retiredAt: null,
      ...(query ? { OR: [{ inventoryNumber: { contains: query, mode: "insensitive" } }, { productVariant: { sku: { contains: query, mode: "insensitive" } } }, { productVariant: { product: { name: { contains: query, mode: "insensitive" } } } }] } : {}) },
      select: { id: true, inventoryNumber: true, currentBranchId: true, productVariantId: true, currentBranch: { select: { name: true } } }, orderBy: [{ inventoryNumber: "asc" }, { id: "asc" }], take: 251 }),
  ]) : [[], [], [], []];
  return <AppShell active="/warehouse" title={titles[operation]} subtitle="Складской учёт по филиалам">
    <WarehouseNav active={`/warehouse/${operation}`}/>
    {params.ok === "1" && <p className="notice" role="status">Операция сохранена. Остатки и история обновлены.</p>}
    <p><Link href={`/warehouse/movements?type=${types[operation]}`}>История: {titles[operation].toLowerCase()}</Link></p>
    {canOperate ? <>
      <form method="get" className="toolbar"><label>Найти товар<input name="q" defaultValue={query} placeholder="Название или код товара"/></label><button className="secondary">Найти</button></form>
      {(variants.length > 200 || instances.length > 250) && <p className="notice">Показаны первые 200 вариантов и 250 экземпляров. Уточните поиск для нужного товара.</p>}
      {variants.length && branches.length ? <WarehouseOperationForm key={query} operation={operation} idempotencyKey={randomUUID()} options={{
        variants: variants.slice(0, 200).map(row => ({ id: row.id, mode: row.product.trackingMode, name: `${row.product.name} · ${row.size.code} · ${row.sku}${row.product.trackingMode === "SERIALIZED" ? " · по экземплярам" : ""}` })),
        branches, locations, instances: instances.slice(0, 250).map(row => ({ id: row.id, name: `${row.inventoryNumber} · ${row.currentBranch.name}`, branchId: row.currentBranchId, variantId: row.productVariantId })),
      }}/> : <p className="notice">Нет доступных товаров или филиалов. Уточните поиск и доступ к филиалам.</p>}
    </> : <p className="notice">У вас нет прав на эту операцию. История доступна по ссылке выше.</p>}
  </AppShell>;
}
