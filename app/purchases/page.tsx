import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { createTenantContext } from "@/lib/tenant/context";
import { getEffectivePermissions } from "@/lib/permissions/effective";
import { listPurchases } from "@/lib/purchases/queries";
const labels = {
  DRAFT: "Черновик",
  CONFIRMED: "Подтверждена",
  PARTIALLY_RECEIVED: "Получена частично",
  RECEIVED: "Получена",
  CLOSED: "Завершена",
  CANCELLED: "Отменена",
} as const;
const money = (v: bigint | null, c: string) =>
  v === null
    ? "Доступ ограничен"
    : new Intl.NumberFormat("ru-KZ", {
        style: "currency",
        currency: c,
        maximumFractionDigits: 0,
      }).format(Number(v));
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const s = await requireRouteAccess("/purchases"),
    t = createTenantContext(s.organizationId),
    [data, p] = await Promise.all([listPurchases(t, s), searchParams]),
    permissions = await getEffectivePermissions(s);
  return (
    <AppShell
      active="/purchases"
      title="Закупки"
      subtitle="Коммерческие документы поставщиков; склад меняется только при отдельной приёмке"
      action={
        <div className="purchase-links">
          {permissions.has("SUPPLIER_VIEW") && (
            <Link className="secondary button-link" href="/purchases/suppliers">
              Поставщики
            </Link>
          )}
          {permissions.has("PURCHASE_CREATE") && (
            <Link className="primary button-link" href="/purchases/new">
              ＋ Закупка
            </Link>
          )}
        </div>
      }
    >
      {(p.ok || p.error) && (
        <p className={p.error ? "notice error" : "notice ok"}>
          {p.error || p.ok}
        </p>
      )}
      <section className="card purchase-list">
        {data.rows.map((row) => (
          <Link
            className="purchase-row"
            href={`/purchases/${row.id}`}
            key={row.id}
          >
            <b>{row.purchaseNumber}</b>
            <span>
              {row.supplier.name}
              <small>{row.destinationBranch.name}</small>
            </span>
            <span>{row._count.items} позиций</span>
            <span className="purchase-status">{labels[row.status]}</span>
            <strong>{money(row.totalMinor, row.currency)}</strong>
          </Link>
        ))}
        {!data.rows.length && <p>Закупок пока нет.</p>}
      </section>
    </AppShell>
  );
}
