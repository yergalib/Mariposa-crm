export function orderReturnPath(raw?: string) {
  if (!raw || raw.length > 12000 || /[\\\r\n]/.test(raw) || !raw.startsWith("/") || raw.startsWith("//")) return "/orders";
  try { const url = new URL(raw, "http://crm.local"); return url.origin === "http://crm.local" && ["/orders", "/calendar"].includes(url.pathname) ? url.pathname + url.search : "/orders"; }
  catch { return "/orders"; }
}

export function calendarWorkspaceParams(raw: string) {
  const safe = orderReturnPath(raw);
  if ((safe !== raw && raw !== "/orders?") || new URL(safe, "http://crm.local").pathname !== "/orders") throw new Error("Invalid order workspace context");
  const params = new URL(safe, "http://crm.local").searchParams;
  // These controls belong to the calendar itself; the remaining list filters
  // (customer, source, financial state, date range, etc.) still restrict it.
  for (const key of ["branchId", "status", "q", "assignedMembershipId"]) params.delete(key);
  return Object.fromEntries([...new Set(params.keys())].map(key => [key, params.getAll(key).length > 1 ? params.getAll(key) : params.get(key) ?? undefined]));
}

export function workspacePositionKey(raw: string) {
  const url = new URL(raw, "http://crm.local");
  const params = new URLSearchParams(url.search);
  for (const [key, value] of [...params]) if (!value) params.delete(key);
  params.sort();
  return url.pathname + (params.size ? `?${params}` : "");
}

export function carryOrderContext(destination: string, referer: string | null) {
  const target = new URL(destination, "http://crm.local");
  const match = /^\/orders\/([0-9a-f-]{36})(?:\/|$)/i.exec(target.pathname);
  if (!match || !referer) return destination;
  try {
    const source = new URL(referer, "http://crm.local");
    if (!(source.pathname === `/orders/${match[1]}` || source.pathname.startsWith(`/orders/${match[1]}/`) || ["/orders/new", "/sales/new"].includes(source.pathname))) return destination;
    const context = source.searchParams.get("returnTo");
    if (context && !target.searchParams.has("returnTo")) target.searchParams.set("returnTo", orderReturnPath(context));
    return target.pathname + target.search + target.hash;
  } catch { return destination; }
}
