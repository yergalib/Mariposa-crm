import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { allowedNavigationPaths, ROLE_LABELS } from "@/lib/auth/access";
import type { AuthContext } from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/permissions/registry";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { AvailableOrganization } from "@/lib/auth/organizations";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";

type NavItem={href:string;icon:IconName;label:string;permission?:PermissionKey|PermissionKey[]};
const primary:NavItem[]=[
  {href:"/",icon:"home",label:"Главная"},{href:"/orders",icon:"orders",label:"Заказы",permission:"ORDER_VIEW"},{href:"/returns",icon:"return",label:"Возвраты",permission:"RETURN_PROCESS"},{href:"/calendar",icon:"calendar",label:"Календарь",permission:"ORDER_VIEW"},
  {href:"/products",icon:"products",label:"Товары",permission:"CATALOG_VIEW"},{href:"/warehouse",icon:"warehouse",label:"Склад",permission:"INVENTORY_VIEW"},{href:"/purchases",icon:"purchases",label:"Закупки",permission:"PURCHASE_VIEW"},{href:"/customers",icon:"customers",label:"Клиенты",permission:"CUSTOMER_VIEW"}
];
const secondary:NavItem[]=[
  {href:"/finance",icon:"finance",label:"Финансы",permission:["PAYMENT_VIEW","FINANCE_DASHBOARD_VIEW","CUSTOMER_BALANCE_VIEW","DEPOSIT_VIEW"]},
  {href:"/whatsapp",icon:"chats",label:"Чаты"},{href:"/settings",icon:"settings",label:"Настройки"}
];
const isAllowed=(item:NavItem,paths:Set<string>,permissions:Set<PermissionKey>)=>paths.has(item.href)&&(!item.permission||(Array.isArray(item.permission)?item.permission.some(x=>permissions.has(x)):permissions.has(item.permission)));
const activeFor=(active:string,href:string)=>href==="/"?active==="/":active===href||active.startsWith(`${href}/`);

function Navigation({items,active}:{items:NavItem[];active:string}){return <>{items.map(item=><Link key={item.href} href={item.href} className={`nav-item ${activeFor(active,item.href)?"active":""}`} aria-current={activeFor(active,item.href)?"page":undefined}><span className="nav-icon"><Icon name={item.icon}/></span><span>{item.label}</span></Link>)}</>}

export function Sidebar({active="/",session,permissions,organizations}:{active?:string;session:AuthContext;permissions:Set<PermissionKey>;organizations:AvailableOrganization[]}){
  const paths=allowedNavigationPaths(session.role), main=primary.filter(x=>isAllowed(x,paths,permissions)), extra=secondary.filter(x=>isAllowed(x,paths,permissions));
  const initial=session.displayName.trim().charAt(0).toUpperCase()||"С", canCreate=permissions.has("ORDER_CREATE");
  return <aside className="sidebar">
    <div className="sidebar-top"><Link href="/" className="brand" aria-label="MARIPOSA CRM — главная"><span className="brand-mark">M</span><span className="brand-copy"><b>MARIPOSA</b><small>управление магазином</small></span></Link><details className="mobile-menu"><summary aria-label="Открыть меню"><Icon name="menu"/></summary><div className="mobile-menu-panel"><nav><Navigation items={[...main,...extra]} active={active}/></nav><div className="mobile-organization-context"><OrganizationSwitcher organizations={organizations} currentMembershipId={session.membershipId} id="mobile-organization-membership" /></div></div></details></div>
    {canCreate&&<Link href="/orders/new" className="sidebar-create"><Icon name="plus"/><span>Новый заказ</span></Link>}
    <nav className="desktop-nav" aria-label="Основная навигация"><div className="nav-group"><Navigation items={main} active={active}/></div><div className="nav-group secondary-nav"><Navigation items={extra} active={active}/></div></nav>
    <div className="sidebar-footer"><span className="avatar">{initial}</span><div className="sidebar-user"><b title={session.displayName}>{session.displayName}</b><small>{ROLE_LABELS[session.role]}</small><OrganizationSwitcher organizations={organizations} currentMembershipId={session.membershipId} id="desktop-organization-membership" className="organization-switch-dark"/><small title={session.defaultBranchName??undefined}>{session.defaultBranchName??"Все филиалы"}</small></div><form action={logoutAction}><button className="logout-button" type="submit" title="Выйти" aria-label="Выйти из CRM">↪</button></form></div>
  </aside>;
}
