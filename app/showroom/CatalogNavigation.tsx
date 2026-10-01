"use client";
import { useRef } from "react";
import Link from "next/link";
import type { BrowseFilters, PublicCategory } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
export function CatalogNavigation({ categories, filters }: { categories: PublicCategory[]; filters: BrowseFilters }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const links = <nav aria-label="Категории товаров"><Link href={browseHref({ ...filters, categoryId: "", page: 1 })} aria-current={!filters.categoryId ? "page" : undefined} onClick={() => dialog.current?.close()}>Все товары</Link>{categories.map(category => <Link key={category.id} href={browseHref({ ...filters, categoryId: category.id, page: 1 })} aria-current={filters.categoryId === category.id ? "page" : undefined} onClick={() => dialog.current?.close()}>{category.name}</Link>)}</nav>;
  return <><aside className="catalog-sidebar"><h2>Каталог</h2>{links}</aside><button className="catalog-mobile-toggle" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Категории</button><dialog className="catalog-drawer" ref={dialog} aria-label="Категории товаров"><button autoFocus onClick={() => dialog.current?.close()}>Закрыть</button>{links}</dialog></>;
}
