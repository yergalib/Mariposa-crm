"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { FAVORITES_KEY, FAVORITES_LIMIT, encodeFavorites, favoriteKey, favoriteRef, readFavorites, type FavoriteRef } from "@/lib/showroom/favorites";
const changed = "mariposa:favorites-changed";
function subscribe(callback: () => void) { window.addEventListener("storage", callback); window.addEventListener(changed, callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener(changed, callback); }; }
function snapshot() { try { return localStorage.getItem(FAVORITES_KEY) ?? ""; } catch { return ""; } }
export function useFavorites() { const raw = useSyncExternalStore(subscribe, snapshot, () => ""); return readFavorites(raw); }
const subscribeReady = () => () => {};
export function useFavoritesReady() { return useSyncExternalStore(subscribeReady, () => true, () => false); }
export function FavoriteButton({ item }: { item: FavoriteRef }) {
  const favorites = useFavorites(), saved = favorites.some(ref => favoriteKey(ref) === favoriteKey(item));
  const [error, setError] = useState("");
  function toggle() {
    if (!favoriteRef.safeParse(item).success) return;
    const current = readFavorites(snapshot()), exists = current.some(ref => favoriteKey(ref) === favoriteKey(item));
    if (!exists && current.length >= FAVORITES_LIMIT) { setError(`Можно сохранить до ${FAVORITES_LIMIT} вариантов. Удалите один из избранного.`); return; }
    // Store identifiers only, never names, prices, contact details or assistant transcripts.
    const next = exists ? current.filter(ref => favoriteKey(ref) !== favoriteKey(item)) : [...current, { productId: item.productId, executionId: item.executionId }];
    try { localStorage.setItem(FAVORITES_KEY, encodeFavorites(next)); window.dispatchEvent(new Event(changed)); setError(""); }
    catch { setError("Браузер не разрешает сохранить избранное."); }
  }
  return <div className="favorite-control"><button type="button" aria-pressed={saved} onClick={toggle}>{saved ? "♥ Убрать из избранного" : "♡ В избранное"}</button>{error && <p role="alert">{error}</p>}</div>;
}
export function FavoritesLink() { const items = useFavorites(); return <Link href="/showroom?view=favorites">Избранное{items.length ? ` (${items.length})` : ""}</Link>; }
