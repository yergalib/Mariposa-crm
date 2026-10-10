import type { BrowseFilters, PublicBrowseCard } from "./contracts";
export function browseHref(filters: BrowseFilters, item?: Pick<PublicBrowseCard, "productId" | "executionId">) {
  const query = new URLSearchParams();
  query.set("view", "catalog");
  if (filters.search) query.set("search", filters.search);
  if (filters.categoryId) query.set("categoryId", filters.categoryId);
  for (const name of ["colorGroup", "size", "branchId", "from", "until"] as const) { const value = filters[name]; if (value) query.set(name, value); }
  if (filters.page > 1) query.set("page", String(filters.page));
  if (item) { query.set("productId", item.productId); if (item.executionId) query.set("executionId", item.executionId); }
  return "/showroom" + (query.size ? "?" + query.toString() : "");
}
