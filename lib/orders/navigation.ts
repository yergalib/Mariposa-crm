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
