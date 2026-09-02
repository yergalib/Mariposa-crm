export type AppRole = "OWNER" | "DIRECTOR" | "CASHIER" | "SELLER";
export type CatalogAction = "MANAGE_CATALOG" | "MANAGE_INVENTORY" | "MANAGE_PHOTOS";
export type CustomerAction = "READ_CUSTOMERS" | "WRITE_CUSTOMERS" | "ARCHIVE_CUSTOMERS" | "IMPORT_CUSTOMERS";
export type OrderAction = "READ_ORDERS" | "CREATE_ORDERS" | "EDIT_ORDERS" | "RESERVE_ORDERS" | "CONFIRM_ORDERS" | "CANCEL_ORDERS";
export type FulfillmentAction = "READ_FULFILLMENT" | "ASSIGN_INSTANCES" | "MARK_READY" | "ISSUE_ITEMS" | "RECEIVE_RETURN" | "MANAGE_MAINTENANCE" | "COMPLETE_FULFILLMENT";

export const ROLE_LABELS: Record<AppRole, string> = {
  OWNER: "Руководитель",
  DIRECTOR: "Директор",
  CASHIER: "Кассир",
  SELLER: "Продавец"
};

const ROUTE_ACCESS: Record<string, readonly AppRole[]> = {
  "/": ["OWNER", "DIRECTOR", "CASHIER", "SELLER"],
  "/orders": ["OWNER", "DIRECTOR", "CASHIER", "SELLER"],
  "/returns": ["OWNER", "DIRECTOR", "CASHIER", "SELLER"],
  "/calendar": ["OWNER", "DIRECTOR", "CASHIER", "SELLER"],
  "/products": ["OWNER", "DIRECTOR", "SELLER"],
  "/warehouse": ["OWNER", "DIRECTOR", "SELLER"],
  "/customers": ["OWNER", "DIRECTOR", "CASHIER", "SELLER"],
  "/finance": ["OWNER", "DIRECTOR", "CASHIER"],
  "/whatsapp": ["OWNER", "DIRECTOR", "SELLER"],
  "/settings": ["OWNER"]
};

export function canAccessRoute(role: AppRole, pathname: string) {
  const route = Object.keys(ROUTE_ACCESS)
    .filter((candidate) =>
      candidate === "/"
        ? pathname === "/"
        : pathname === candidate || pathname.startsWith(`${candidate}/`)
    )
    .sort((a, b) => b.length - a.length)[0];

  return route ? ROUTE_ACCESS[route].includes(role) : false;
}

export function allowedNavigationPaths(role: AppRole) {
  return new Set(
    Object.entries(ROUTE_ACCESS)
      .filter(([, roles]) => roles.includes(role))
      .map(([path]) => path)
  );
}

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
