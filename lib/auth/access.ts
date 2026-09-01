export type AppRole = "OWNER" | "DIRECTOR" | "CASHIER" | "SELLER";
export type CatalogAction = "MANAGE_CATALOG" | "MANAGE_INVENTORY" | "MANAGE_PHOTOS";
export type CustomerAction = "READ_CUSTOMERS" | "WRITE_CUSTOMERS" | "ARCHIVE_CUSTOMERS" | "IMPORT_CUSTOMERS";

export const ROLE_LABELS: Record<AppRole, string> = {
  OWNER: "Руководитель",
  DIRECTOR: "Директор",
  CASHIER: "Кассир",
  SELLER: "Продавец"
};

const ROUTE_ACCESS: Record<string, readonly AppRole[]> = {
  "/": ["OWNER", "DIRECTOR", "CASHIER", "SELLER"],
  "/orders": ["OWNER", "DIRECTOR", "CASHIER", "SELLER"],
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
