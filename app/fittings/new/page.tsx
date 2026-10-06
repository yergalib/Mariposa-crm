import {randomUUID} from "node:crypto";
import {AppShell} from "@/components/AppShell";
import {FittingForm} from "@/components/FittingForm";
import {requireRouteAccess} from "@/lib/auth/session";
import {requirePermission} from "@/lib/permissions/effective";
import {getInquiry} from "@/lib/inquiries/service";
import {workflowOptions} from "@/lib/workspace/conversion";
import {createFittingAction} from "../actions";
export default async function Page({searchParams}:{searchParams:Promise<{branchId?:string;inquiryId?:string;q?:string;error?:string}>}){const session=await requireRouteAccess("/fittings"),p=await searchParams;await requirePermission(session,"FITTING_MANAGE");const inquiry=p.inquiryId?await getInquiry(session,p.inquiryId):null,options=await workflowOptions(session,"FITTING_VIEW",inquiry?.branchId??p.branchId,p.q);return <AppShell active="/fittings" title="Новая примерка" subtitle="30 минут с выбранным сотрудником">{p.error&&<p className="notice error">{p.error}</p>}<form className="fitting-search"><input type="hidden" name="inquiryId" value={inquiry?.id??""}/><label>Филиал<select name="branchId" defaultValue={options.branch?.id} disabled={Boolean(inquiry)}>{options.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Поиск клиента или товара<input name="q" defaultValue={p.q}/></label><button>Обновить подбор</button></form>{options.branch?<FittingForm creationKey={randomUUID()} action={createFittingAction} options={options} actorId={session.membershipId} inquiry={inquiry??undefined}/>:<p>Нет доступных филиалов.</p>}</AppShell>}
