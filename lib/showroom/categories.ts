import type { PublicCategory } from "./contracts";
export type CategoryNode = { key: string; label: string; ids: string[]; children: CategoryNode[] };
export function categoryTree(categories: PublicCategory[]): CategoryNode[] {
  const roots: CategoryNode[] = [];
  for (const category of categories) {
    const parts = category.name.split(">").map(part => part.trim()).filter(Boolean).filter((part, index, all) => index === 0 || part !== all[index - 1]);
    let level = roots; const path: string[] = [];
    for (const label of parts) {
      path.push(label); let node = level.find(candidate => candidate.label === label);
      if (!node) { node = { key: "path:" + path.join(" > "), label, ids: [], children: [] }; level.push(node); }
      if (!node.ids.includes(category.id)) node.ids.push(category.id);
      level = node.children;
    }
  }
  const leaves = (nodes: CategoryNode[]) => { for (const node of nodes) { if (!node.children.length && node.ids.length === 1) node.key = node.ids[0]; leaves(node.children); } };
  leaves(roots); return roots;
}
export function categoryIds(categories: PublicCategory[], key: string): string[] {
  if (categories.some(category => category.id === key)) return [key];
  const find = (nodes: CategoryNode[]): string[] => { for (const node of nodes) { if (node.key === key) return node.ids; const child = find(node.children); if (child.length) return child; } return []; };
  return find(categoryTree(categories));
}
export function branchLabel(branch: { city: string; name: string }) {
  return branch.city.trim().toLocaleLowerCase() === branch.name.trim().toLocaleLowerCase() ? branch.city : `${branch.city} — ${branch.name}`;
}
