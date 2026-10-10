import type { BrowseFilters, PublicBranch, PublicCategory } from "./contracts";
import { branchLabel, categoryTree, type CategoryNode } from "./categories";
import { colorGroups } from "./color-groups";
import { browseHref } from "./navigation";

// Preserve explicit values so invalid public branch IDs still reach server guards.
export function defaultBranchId(branches: PublicBranch[], current?: string) {
  return current || (branches.length === 1 ? branches[0].id : "");
}
export function activeCatalogFilters(filters: BrowseFilters, categories: PublicCategory[], branches: PublicBranch[]) {
  const chips: { key: string; label: string; href: string }[] = [];
  const add = (key: string, label: string, clear: Partial<BrowseFilters>) => chips.push({ key, label, href: browseHref({ ...filters, ...clear, page: 1 }) });
  const categoryName = (nodes: CategoryNode[]): string | undefined => {
    for (const node of nodes) { if (node.key === filters.categoryId) return node.label; const found = categoryName(node.children); if (found) return found; }
  };
  if (filters.search) add("search", `Поиск: ${filters.search}`, { search: "" });
  if (filters.categoryId) add("category", `Категория: ${categoryName(categoryTree(categories)) ?? "выбрана"}`, { categoryId: "" });
  if (filters.colorGroup) add("color", `Цвет: ${colorGroups.find(g => g.id === filters.colorGroup)?.label ?? filters.colorGroup}`, { colorGroup: "" });
  if (filters.size) add("size", `Размер: ${filters.size}`, { size: "" });
  // The only public branch is a default context, not a removable narrowing filter.
  if (filters.branchId && !(branches.length === 1 && branches[0].id === filters.branchId)) {
    const branch = branches.find(b => b.id === filters.branchId);
    add("branch", `Филиал: ${branch ? branchLabel(branch) : "выбран"}`, { branchId: "", from: "", until: "" });
  }
  if (filters.from || filters.until) add("period", `Аренда: ${filters.from?.replace("T", " ") || "получение не выбрано"} — ${filters.until?.replace("T", " ") || "возврат не выбран"}`, { from: "", until: "" });
  return chips;
}
