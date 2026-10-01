"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PublicProductDetail } from "@/lib/showroom/contracts";
import { favoriteKey, type FavoriteRef } from "@/lib/showroom/favorites";
import { browseHref } from "@/lib/showroom/navigation";
import { FavoriteButton, useFavorites, useFavoritesReady } from "./FavoriteButton";
import { PhotoPlaceholder } from "./ShowroomPresentation";
import { AssistantLink } from "./AssistantLink";
export type FavoriteResult = { ref: FavoriteRef; product: PublicProductDetail | null; unavailable: boolean };
export function Favorites({ results, loadedKeys }: { results: FavoriteResult[]; loadedKeys: string }) {
  const router = useRouter(), items = useFavorites(), keys = items.map(favoriteKey).join(",");
  const ready = useFavoritesReady();
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { if (ready && keys !== loadedKeys) router.replace("/showroom?view=favorites" + (keys ? "&items=" + encodeURIComponent(keys) : ""), { scroll: false }); }, [ready, keys, loadedKeys, router]);
  const current = results.filter(row => items.some(ref => favoriteKey(ref) === favoriteKey(row.ref)));
  const compared = current.flatMap(row => row.product && selected.includes(favoriteKey(row.ref)) ? [row.product] : []);
  return <section className="favorites-page"><h1>Избранное</h1><p className="site-muted">Сохраняйте варианты в этом браузере и сравнивайте перед примеркой. До 12 вещей, на 30 дней. Это не бронь.</p>
    {!ready || keys !== loadedKeys ? <p role="status">Проверяем сохранённые товары…</p> : !current.length ? <p>В избранном пока пусто. <Link href="/showroom?view=catalog">Смотреть каталог →</Link></p> : <>
      <div className="favorites-compare"><p>Выберите до четырёх вариантов для сравнения.</p><AssistantLink products={compared} className="site-button site-primary" disabled={!compared.length}>Помочь выбрать ({compared.length})</AssistantLink></div>
      <div className="showroom-items">{current.map(row => <article className="showroom-product" key={favoriteKey(row.ref)}>
        {row.product ? <><Link href={browseHref({ search: "", categoryId: "", page: 1 }, row.product) + "&back=favorites"}><PhotoPlaceholder /><h2>{row.product.name}</h2></Link><p>{row.product.execution || row.product.color}</p><p>Размеры: {row.product.options.map(option => option.size).join(", ")}</p><p>Уточнить стоимость</p><label className="favorite-choice"><input type="checkbox" checked={selected.includes(favoriteKey(row.ref))} disabled={!selected.includes(favoriteKey(row.ref)) && compared.length >= 4} onChange={event => setSelected(value => event.target.checked ? [...value.filter(key => key !== favoriteKey(row.ref)), favoriteKey(row.ref)] : value.filter(key => key !== favoriteKey(row.ref)))} />Сравнить</label></> : <><PhotoPlaceholder /><p role="status">{row.unavailable ? "Товар больше недоступен в витрине." : "Не удалось проверить товар. Повторите позже."}</p></>}
        <FavoriteButton item={row.ref} />
      </article>)}</div>
      {compared.length > 0 && <section className="favorite-comparison" aria-label="Сравнение выбранных вариантов"><h2>Ваша подборка</h2><div className="favorite-table-wrap"><table><thead><tr><th>Параметр</th>{compared.map(item => <th key={item.id}>{item.name}</th>)}</tr></thead><tbody><tr><th>Цвет / исполнение</th>{compared.map(item => <td key={item.id}>{item.execution || item.color || "Не указан"}</td>)}</tr><tr><th>Размеры в каталоге</th>{compared.map(item => <td key={item.id}>{item.options.map(option => option.size).join(", ")}</td>)}</tr><tr><th>Цена / наличие</th>{compared.map(item => <td key={item.id}>Уточнить стоимость. Наличие проверяется на выбранные даты.</td>)}</tr></tbody></table></div></section>}
    </>}
  </section>;
}
