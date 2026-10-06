import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/AppShell";
import { requireRouteAccess } from "@/lib/auth/session";
import { hasPermission, requirePermission } from "@/lib/permissions/effective";
import { inquiryOptions, inquiriesNotInstalled } from "@/lib/inquiries/service";
import { InquiryForm } from "../InquiryForm";
import "../chats.css";

export default async function NewInquiry({ searchParams }: { searchParams: Promise<{ branchId?: string; q?: string }> }) {
  const session = await requireRouteAccess("/chats");
  await requirePermission(session, "LEAD_CREATE");
  const query = await searchParams;
  let options;
  try { options = await inquiryOptions(session, query.branchId, query.q); }
  catch (error) {
    if (!inquiriesNotInstalled(error)) throw error;
    return <AppShell active="/chats" title="Новое обращение"><p className="card">Очередь пока не включена. Требуется согласованное обновление базы данных.</p></AppShell>;
  }
  const canAssign = await hasPermission(session, "LEAD_ASSIGN");
  return <AppShell active="/chats" title="Новое обращение" subtitle="Ручная регистрация заявки без брони">
    <section className="card"><Link href="/chats">← К очереди</Link>
      <p>Сначала выберите филиал и уточните список товаров. Изменение этого фильтра перезагрузит форму и сбросит несохранённый ввод.</p>
      <form method="get" className="inquiry-filters">
        <label>Филиал<select name="branchId" defaultValue={options.branch?.id ?? ""} required>{options.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Название или SKU<input name="q" maxLength={100} defaultValue={query.q ?? ""} /></label><button className="secondary">Выбрать / найти</button>
      </form>
      {options.branch ? <><p>Филиал: {options.branch.name}. Показаны до 50 подходящих вариантов; уточните поиск при необходимости.</p>
        <InquiryForm key={`${options.branch.id}:${query.q ?? ""}`} branchId={options.branch.id} timezone={options.branch.timezone}
          creationKey={randomUUID()} canAssign={canAssign} canClose={false} assignees={options.assignees} variants={options.variants} />
      </> : <p>Выберите доступный филиал.</p>}
    </section>
  </AppShell>;
}
