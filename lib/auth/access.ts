import { ROLE_DEFAULT_PERMISSIONS, type PermissionKey } from "@/lib/permissions/registry";
export type AppRole = "OWNER" | "DIRECTOR" | "CASHIER" | "SELLER";
export type CatalogAction = "MANAGE_CATALOG" | "MANAGE_INVENTORY" | "MANAGE_PHOTOS";
export type CustomerAction = "READ_CUSTOMERS" | "WRITE_CUSTOMERS" | "ARCHIVE_CUSTOMERS" | "IMPORT_CUSTOMERS";
export type OrderAction = "READ_ORDERS" | "CREATE_ORDERS" | "EDIT_ORDERS" | "RESERVE_ORDERS" | "CONFIRM_ORDERS" | "CANCEL_ORDERS";
export type FulfillmentAction = "READ_FULFILLMENT" | "ASSIGN_INSTANCES" | "MARK_READY" | "ISSUE_ITEMS" | "RECEIVE_RETURN" | "MANAGE_MAINTENANCE" | "COMPLETE_FULFILLMENT";
export type StaffAction = "READ_STAFF" | "MANAGE_STAFF";

export const ROLE_LABELS: Record<AppRole, string> = {
  OWNER: "Руководитель",
  DIRECTOR: "Директор",
  CASHIER: "Кассир",
  SELLER: "Продавец"
};

const ROUTE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  "/cash/accounts": ["CASH_ACCOUNT_VIEW"],
  "/": [],
  "/payroll": [
    "PAYROLL_VIEW"
  ],
  "/my-shifts": [
    "SHIFT_VIEW"
  ],
  "/notifications": [],
  "/schedule": [
    "SHIFT_VIEW"
  ],
  "/cash": [
    "CASH_ACCOUNT_VIEW",
    "PAYMENT_CREATE",
    "PAYMENT_VIEW",
    "DEPOSIT_VIEW"
  ],
  "/tasks": [
    "TASK_VIEW"
  ],
  "/fittings": [
    "FITTING_VIEW"
  ],
  "/reports": [
    "REPORT_FINANCE_VIEW"
  ],
  "/orders": [
    "ORDER_VIEW"
  ],
  "/sales": [
    "ORDER_VIEW"
  ],
  "/returns": [
    "ORDER_VIEW"
  ],
  "/calendar": [
    "ORDER_VIEW"
  ],
  "/products": [
    "CATALOG_VIEW"
  ],
  "/warehouse": [
    "INVENTORY_VIEW"
  ],
  "/customers": [
    "CUSTOMER_VIEW"
  ],
  "/finance": [
    "FINANCE_DASHBOARD_VIEW"
  ],
  "/purchases": [
    "PURCHASE_VIEW"
  ],
  "/whatsapp": [
    "LEAD_VIEW"
  ],
  "/chats": [
    "LEAD_VIEW"
  ],
  "/settings": [],
  "/settings/staff": [
    "STAFF_VIEW",
    "STAFF_PERMISSION_MANAGE"
  ],
  "/settings/staff/roles": [
    "STAFF_PERMISSION_MANAGE"
  ],
  "/settings/documents": [
    "DOCUMENT_SETTINGS_VIEW"
  ],
  "/settings/business": [
    "SETTINGS_VIEW"
  ],
  "/settings/audit": [
    "AUDIT_LOG_VIEW"
  ]
};
export function canAccessRoute(role: AppRole, pathname: string, permissions: ReadonlySet<PermissionKey> = ROLE_DEFAULT_PERMISSIONS[role]) {
 const route = Object.keys(ROUTE_PERMISSIONS).filter(p => p === "/" ? pathname === p : pathname === p || pathname.startsWith(p+"/")).sort((a,b)=>b.length-a.length)[0];
 return Boolean(route && (!ROUTE_PERMISSIONS[route].length || ROUTE_PERMISSIONS[route].some(key=>permissions.has(key))));
}
export function allowedNavigationPaths(role: AppRole, permissions: ReadonlySet<PermissionKey> = ROLE_DEFAULT_PERMISSIONS[role]) { return new Set(Object.keys(ROUTE_PERMISSIONS).filter(path=>canAccessRoute(role,path,permissions))); }

const CATALOG_ACTION_ROLES: Record<CatalogAction, readonly AppRole[]> = {
  MANAGE_CATALOG: ["OWNER", "DIRECTOR"],
  MANAGE_INVENTORY: ["OWNER", "DIRECTOR", "SELLER"],
  MANAGE_PHOTOS: ["OWNER", "DIRECTOR", "SELLER"]
};

export function canPerformCatalogAction(role: AppRole, action: CatalogAction) {
  return CATALOG_ACTION_ROLES[action].includes(role);
}

const CUSTOMER_ACTION_ROLES:Record<CustomerAction,readonly AppRole[]>={READ_CUSTOMERS:["OWNER","DIRECTOR","SELLER","CASHIER"],WRITE_CUSTOMERS:["OWNER","DIRECTOR","SELLER"],ARCHIVE_CUSTOMERS:["OWNER","DIRECTOR"],IMPORT_CUSTOMERS:["OWNER","DIRECTOR"]};
export function canPerformCustomerAction(role:AppRole,action:CustomerAction){return CUSTOMER_ACTION_ROLES[action].includes(role);}

const ORDER_ACTION_ROLES:Record<OrderAction,readonly AppRole[]>={READ_ORDERS:["OWNER","DIRECTOR","SELLER","CASHIER"],CREATE_ORDERS:["OWNER","DIRECTOR","SELLER"],EDIT_ORDERS:["OWNER","DIRECTOR","SELLER"],RESERVE_ORDERS:["OWNER","DIRECTOR","SELLER"],CONFIRM_ORDERS:["OWNER","DIRECTOR","SELLER"],CANCEL_ORDERS:["OWNER","DIRECTOR"]};
export function canPerformOrderAction(role:AppRole,action:OrderAction){return ORDER_ACTION_ROLES[action].includes(role);}

const FULFILLMENT_ACTION_ROLES: Record<FulfillmentAction, readonly AppRole[]> = {
  READ_FULFILLMENT: ["OWNER", "DIRECTOR", "SELLER", "CASHIER"],
  ASSIGN_INSTANCES: ["OWNER", "DIRECTOR", "SELLER"],
  MARK_READY: ["OWNER", "DIRECTOR", "SELLER"],
  ISSUE_ITEMS: ["OWNER", "DIRECTOR", "SELLER"],
  RECEIVE_RETURN: ["OWNER", "DIRECTOR", "SELLER"],
  MANAGE_MAINTENANCE: ["OWNER", "DIRECTOR", "SELLER"],
  COMPLETE_FULFILLMENT: ["OWNER", "DIRECTOR", "SELLER"],
};
export function canPerformFulfillmentAction(role: AppRole, action: FulfillmentAction) {
  return FULFILLMENT_ACTION_ROLES[action].includes(role);
}
