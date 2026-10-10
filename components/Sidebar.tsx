import Link from "next/link";
import { LogoutForm } from "@/app/login/LogoutForm";
import { allowedNavigationPaths, ROLE_LABELS } from "@/lib/auth/access";
import type { AuthContext } from "@/lib/auth/session";
import type { PermissionKey } from "@/lib/permissions/registry";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { AvailableOrganization } from "@/lib/auth/organizations";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import { MobileNavigation } from "@/components/MobileNavigation";

type NavItem={href:string;icon:IconName;label:string;permission?:PermissionKey|PermissionKey[]};
const primary:NavItem[]=[
{href:"/",icon:"home",label:"Главная"},
{href:"/orders",icon:"orders",label:"Заказы",permission:"ORDER_VIEW"},
{href:"/fittings",icon:"calendar",label:"Примерки",permission:"FITTING_VIEW"},
{href:"/returns",icon:"return",label:"Возвраты",permission:"RETURN_PROCESS"},
{href:"/calendar",icon:"calendar",label:"Календарь",permission:"ORDER_VIEW"},
{href:"/sales",icon:"sales",label:"Продажи",permission:["SALE_CONFIRM","SALE_FULFILL"]},
{href:"/customers",icon:"customers",label:"Клиенты",permission:"CUSTOMER_VIEW"},
{href:"/products",icon:"products",label:"Товары",permission:"CATALOG_VIEW"},
{href:"/warehouse",icon:"warehouse",label:"Склад",permission:"INVENTORY_VIEW"},
{href:"/purchases",icon:"purchases",label:"Закупки",permission:"PURCHASE_VIEW"},
{href:"/tasks",icon:"orders",label:"Задачи",permission:"TASK_VIEW"},
{href:"/schedule",icon:"calendar",label:"График смен",permission:"SHIFT_VIEW"},
{href:"/my-shifts",icon:"calendar",label:"Мои смены",permission:"SHIFT_VIEW"},
{href:"/notifications",icon:"calendar",label:"Уведомления"}
];
const secondary:NavItem[]=[
  {href:"/payroll",icon:"finance",label:"Зарплата",permission:"PAYROLL_VIEW"},
  {href:"/cash",icon:"finance",label:"Касса",permission:["CASH_ACCOUNT_VIEW","PAYMENT_CREATE","PAYMENT_VIEW","DEPOSIT_VIEW"]},
  {href:"/reports",icon:"finance",label:"Отчёты",permission:"REPORT_FINANCE_VIEW"},
  {href:"/finance",icon:"finance",label:"Финансы",permission:"FINANCE_DASHBOARD_VIEW"},
  {href:"/chats",icon:"chats",label:"Обращения",permission:"LEAD_VIEW"},{href:"/settings",icon:"settings",label:"Настройки"}
];
const isAllowed=(item:NavItem,paths:Set<string>,permissions:Set<PermissionKey>)=>paths.has(item.href)&&(!item.permission||(Array.isArray(item.permission)?item.permission.some(x=>permissions.has(x)):permissions.has(item.permission)));
const activeFor=(active:string,href:string)=>href==="/"?active==="/":active===href||active.startsWith(`${href}/`);

function Navigation({items,active,mode="desktop"}:{items:NavItem[];active:string;mode?:"desktop"|"mobile"}){const itemClass=mode==="mobile"?"mobile-nav-item":"nav-item",iconClass=mode==="mobile"?"mobile-nav-icon":"nav-icon";return <>{items.map(item=><Link key={item.href} href={item.href} className={`${itemClass} ${activeFor(active,item.href)?"active":""}`} aria-current={activeFor(active,item.href)?"page":undefined}><span className={iconClass}><Icon name={item.icon}/></span><span className={mode==="mobile"?"mobile-nav-label":undefined}>{item.label}</span></Link>)}</>}

export function Sidebar({active="/",session,permissions,organizations}:{active?:string;session:AuthContext;permissions:Set<PermissionKey>;organizations:AvailableOrganization[]}){
  const paths=allowedNavigationPaths(session.role,permissions), main=primary.filter(x=>isAllowed(x,paths,permissions)), extra=secondary.filter(x=>isAllowed(x,paths,permissions));
  const initial=session.displayName.trim().charAt(0).toUpperCase()||"С", canCreate=permissions.has("ORDER_CREATE");
  return <aside className="sidebar">
    <div className="sidebar-top"><Link href="/" className="brand" aria-label="MARIPOSA CRM — главная"><span className="brand-mark">M</span><span className="brand-copy"><b>MARIPOSA</b><small>управление магазином</small></span></Link><MobileNavigation key={active} account={<LogoutForm><button className="mobile-logout-button" type="submit">Выйти</button></LogoutForm>} navigation={<Navigation items={[...main,...extra]} active={active} mode="mobile"/>} organization={<OrganizationSwitcher organizations={organizations} currentMembershipId={session.membershipId} id="mobile-organization-membership" />}/></div>
    {canCreate&&<Link href="/orders/new" className="sidebar-create"><Icon name="plus"/><span>Новый заказ</span></Link>}
    <nav className="desktop-nav" aria-label="Основная навигация">{[{label:"Работа с клиентом",paths:["/","/orders","/fittings","/returns","/calendar","/sales","/customers","/chats"]},{label:"Товары",paths:["/products","/warehouse","/purchases"]},{label:"Деньги",paths:["/cash","/reports","/finance"]},{label:"Сотрудники",paths:["/tasks","/schedule","/my-shifts","/payroll"]},{label:"Настройки",paths:["/settings"]}].map(group => {const items=[...main,...extra].filter(item=>group.paths.includes(item.href));return items.length ? group.label === "Работа с клиентом" ? <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span><Navigation items={items} active={active}/></div> : <details className="nav-group" key={group.label} open={items.some(item=>activeFor(active,item.href))}><summary className="nav-group-label">{group.label}</summary><Navigation items={items} active={active}/></details> : null;})}</nav>
    <div className="sidebar-footer"><span className="avatar">{initial}</span><div className="sidebar-user"><b title={session.displayName}>{session.displayName}</b><small>{session.permissionRoleName ?? ROLE_LABELS[session.role]}</small><OrganizationSwitcher organizations={organizations} currentMembershipId={session.membershipId} id="desktop-organization-membership" className="organization-switch-dark"/><small title={session.defaultBranchName??undefined}>{session.defaultBranchName??"Все филиалы"}</small></div><LogoutForm><button className="logout-button" type="submit" title="Выйти" aria-label="Выйти из CRM">↪</button></LogoutForm></div>
  </aside>;
}
