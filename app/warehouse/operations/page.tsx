import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createTenantContext } from "@/lib/tenant/context";
import { hasPermission } from "@/lib/permissions/effective";
import { getBulkMaintenanceQueue } from "@/lib/inventory/bulk-operations";
import { completeBulkMaintenanceAction, correctionAction, receiptAction, transferAction, transitionBulkMaintenanceAction, writeOffBulkMaintenanceAction } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireRouteAccess("/warehouse/operations");
  const params = await searchParams;
  const tenant = createTenantContext(session.organizationId);
  const [canMaintain,canWriteOff] = await Promise.all([hasPermission(session, "MAINTENANCE_COMPLETE"),hasPermission(session,"INVENTORY_WRITE_OFF")]);
  const [variants, branches, locations, instances, maintenance] = await Promise.all([
    db.productVariant.findMany({ where: { organizationId: session.organizationId, isActive: true }, include: { product: true, size: true }, take: 200 }),
    db.branch.findMany({ where: { organizationId: session.organizationId, status: "ACTIVE" } }),
    db.location.findMany({ where: { organizationId: session.organizationId, isActive: true } }),
    db.productInstance.findMany({ where: { organizationId: session.organizationId, operationalStatus: "AVAILABLE" }, include: { productVariant: { include: { product: true, size: true } } }, take: 250 }),
    canMaintain ? getBulkMaintenanceQueue(tenant, { userId: session.userId, membershipId: session.membershipId, role: session.role }) : Promise.resolve([])
  ]);
  const variantOptions = <>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.product.name} · {variant.size.code} · {variant.product.trackingMode}</option>)}</>;
  const branchOptions = <>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</>;
  const locationOptions = <>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</>;
  return <AppShell active="/warehouse" title="Складские операции" subtitle="Приёмка, перемещение, обслуживание и документированные корректировки">
    {(params.ok || params.error) && <div className={params.error ? "alert error" : "alert success"}>{params.error || params.ok}</div>}
    <div className="toolbar"><Link href="/warehouse">Остатки</Link><Link href="/warehouse/movements">История</Link></div>
    {canMaintain && <section className="card"><div className="card-head"><div><h2>BULK чистка и ремонт</h2><p>Физический остаток не меняется; завершение освобождает только указанное количество.</p></div></div>
      {maintenance.length === 0 ? <p className="muted">Активных количественных работ нет.</p> : <div className="order-items">{maintenance.map((row) => {
        const serviceLocations = locations.filter((location) => location.branchId === row.branchId && !["CLEANING", "REPAIR", "TRANSIT"].includes(location.type));
        const repairLocations = locations.filter((location) => location.branchId === row.branchId && location.type === "REPAIR");
        return <article className="fulfillment-item" key={row.id}><div><b>{row.productName} · {row.size}</b><span>{row.branchName} · {row.kind === "CLEANING" ? "Чистка" : "Ремонт"} · активно {row.activeQuantity} шт.</span><small>{row.sku} · {row.locationName}</small></div>
          <form action={completeBulkMaintenanceAction} className="return-form"><input type="hidden" name="allocationId" value={row.id}/><input type="hidden" name="idempotencyKey" value={`bulk-maintenance-complete:${randomUUID()}`}/><input name="quantity" type="number" min="1" max={row.activeQuantity} defaultValue={row.activeQuantity}/><select name="destinationLocationId" required defaultValue={serviceLocations[0]?.id ?? ""}><option value="" disabled>Вернуть в доступную локацию</option>{serviceLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><input name="note" maxLength={1000} placeholder="Комментарий"/><button className="primary">Завершить</button></form>
          {row.kind === "CLEANING" && <form action={transitionBulkMaintenanceAction} className="return-form"><input type="hidden" name="allocationId" value={row.id}/><input type="hidden" name="idempotencyKey" value={`bulk-maintenance-repair:${randomUUID()}`}/><input name="quantity" type="number" min="1" max={row.activeQuantity} defaultValue="1"/><select name="repairLocationId" required defaultValue={repairLocations[0]?.id ?? ""}><option value="" disabled>Ремонтная локация</option>{repairLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><input name="note" maxLength={1000} placeholder="Причина перевода"/><button className="secondary">Перевести в ремонт</button></form>}
          {row.kind === "REPAIR"&&canWriteOff&&<form action={writeOffBulkMaintenanceAction} className="return-form"><input type="hidden" name="allocationId" value={row.id}/><input type="hidden" name="idempotencyKey" value={`bulk-maintenance-writeoff:${randomUUID()}`}/><input name="quantity" type="number" min="1" max={row.activeQuantity} defaultValue="1"/><input name="note" minLength={3} maxLength={1000} placeholder="Обязательная причина списания" required/><label className="confirm-check"><input type="checkbox" name="confirmed" value="yes" required/> Подтверждаю физическое списание</label><button className="danger">Списать</button></form>}
        </article>;
      })}</div>}
    </section>}
    <section className="settings-grid">
      <form action={receiptAction} className="card form-grid"><h2>Приёмка</h2><input type="hidden" name="idempotencyKey" value={randomUUID()}/><select name="mode"><option>SERIALIZED</option><option>BULK</option></select><select name="variantId">{variantOptions}</select><select name="branchId">{branchOptions}</select><select name="locationId">{locationOptions}</select><input name="quantity" type="number" min="1" defaultValue="1"/><input name="reason" placeholder="Комментарий / источник"/><button>Принять</button></form>
      <form action={transferAction} className="card form-grid"><h2>Перемещение</h2><input type="hidden" name="idempotencyKey" value={randomUUID()}/><select name="mode"><option>SERIALIZED</option><option>BULK</option></select><select name="instanceId"><option value="">Экземпляр</option>{instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.inventoryNumber} · {instance.productVariant.product.name}</option>)}</select><select name="variantId">{variantOptions}</select><select name="fromBranchId">{branchOptions}</select><select name="fromLocationId">{locationOptions}</select><select name="toBranchId">{branchOptions}</select><select name="toLocationId">{locationOptions}</select><input name="quantity" type="number" min="1" defaultValue="1"/><input name="reason" placeholder="Комментарий"/><button>Переместить</button></form>
      <form action={correctionAction} className="card form-grid"><h2>Корректировка</h2><input type="hidden" name="idempotencyKey" value={randomUUID()}/><select name="mode"><option>BULK</option><option>SERIALIZED</option></select><select name="type"><option>ADJUSTMENT</option><option>WRITE_OFF</option><option>LOSS</option><option>FOUND</option><option>RESTORE</option></select><select name="variantId">{variantOptions}</select><select name="instanceId"><option value="">Экземпляр</option>{instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.inventoryNumber}</option>)}</select><select name="branchId">{branchOptions}</select><select name="locationId">{locationOptions}</select><input name="delta" type="number" defaultValue="-1"/><input name="reason" required placeholder="Обязательная причина"/><button>Сохранить</button></form>
    </section>
  </AppShell>;
}
