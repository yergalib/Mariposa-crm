"use client";
import { useRef } from "react";
import Link from "next/link";
import type { BrowseFilters, PublicCategory } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { categoryTree, type CategoryNode } from "@/lib/showroom/categories";
export function CatalogNavigation({ categories, filters }: { categories: PublicCategory[]; filters: BrowseFilters }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const link = (node: CategoryNode, label = node.label) => <Link href={browseHref({ ...filters, categoryId: node.key, page: 1 })} aria-current={filters.categoryId === node.key ? "page" : undefined} onClick={() => dialog.current?.close()}>{label}</Link>;
  const active = (node: CategoryNode): boolean => node.key === filters.categoryId || node.ids.includes(filters.categoryId) || node.children.some(active);
  const render = (nodes: CategoryNode[]) => nodes.map(node => node.children.length ? <details key={node.key + filters.categoryId} open={active(node)} className="catalog-category-group"><summary>{node.label}</summary><div>{link(node, "Все в разделе")}{render(node.children)}</div></details> : <div key={node.key}>{link(node)}</div>);
  const links = <nav aria-label="Категории товаров"><Link href={browseHref({ ...filters, categoryId: "", page: 1 })} aria-current={!filters.categoryId ? "page" : undefined} onClick={() => dialog.current?.close()}>Все товары</Link>{render(categoryTree(categories))}</nav>;
  return <><aside className="catalog-sidebar"><h2>Каталог</h2>{links}</aside><button className="catalog-mobile-toggle" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Категории</button><dialog className="catalog-drawer" ref={dialog} aria-label="Категории товаров"><button autoFocus onClick={() => dialog.current?.close()}>Закрыть</button>{links}</dialog></>;
}
