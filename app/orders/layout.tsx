import {Suspense,type ReactNode} from "react";
import {OrderNavigationContext} from "@/components/OrderNavigationContext";
import {requireRouteAccess} from "@/lib/auth/session";
export default async function Layout({children}:{children:ReactNode}){const s=await requireRouteAccess("/orders");return <Suspense fallback={<p role="status">Загружаем рабочую область…</p>}><OrderNavigationContext scope={s.organizationId+":"+s.membershipId}>{children}</OrderNavigationContext></Suspense>;}
