import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/effective";
import { accessibleBranchIds } from "@/lib/staff/branch-access";
import { createTenantContext } from "@/lib/tenant/context";
import { db } from "@/lib/db";

export default async function Page() {
  const session = await requireRouteAccess("/purchases");
  await requirePermission(session, "PURCHASE_VIEW");
  await requirePermission(session, "REPORT_FINANCE_VIEW");
  const branchIds = await accessibleBranchIds(createTenantContext(session.organizationId), session.membershipId);
  const branches = await db.branch.findMany({ where: { organizationId: session.organizationId, id: branchIds ? { in: branchIds } : undefined }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return <AppShell active="/purchases" title="Отчёт закупок" subtitle="Документы закупок и фактические приёмки">
    <section className="card">
      <p>Отбор по дате создания закупки: календарные дни UTC включительно. Приёмки учитываются за всё время выбранных закупок.</p>
      <p>Заказано, получено и ещё не получено; итоги отдельно по статусу и валюте. При наличии права на закупочную стоимость доступны суммы документов и стоимость приёмки. Эти суммы не показывают платежи или кассовый расход.</p>
      <form action="/purchases/export" method="get">
        <label>Создана с <input type="date" name="from" /></label>{" "}
        <label>Создана по <input type="date" name="to" /></label>{" "}
        <label>Филиал <select name="branchId" defaultValue=""><option value="">Все доступные</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{" "}
        <label>Статус <select name="status" defaultValue="">
          <option value="">Все статусы</option><option value="DRAFT">Черновик</option><option value="CONFIRMED">Подтверждена</option>
          <option value="PARTIALLY_RECEIVED">Получена частично</option><option value="RECEIVED">Получена</option><option value="CLOSED">Завершена</option><option value="CANCELLED">Отменена</option>
        </select></label>{" "}
        <button type="submit" className="primary">Скачать XLSX</button>
      </form>
      <p>Включены только доступные филиалы. Черновики, отменённые и завершённые закупки показаны отдельно; неполученное количество не означает обязанность принять товар.</p>
    </section>
  </AppShell>;
}
