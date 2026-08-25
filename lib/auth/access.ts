export type AppRole = "OWNER" | "DIRECTOR" | "CASHIER" | "SELLER";

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
