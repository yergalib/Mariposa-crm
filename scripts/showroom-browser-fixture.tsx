// Local browser harness only. Not an App Router route; no database or live API.
import { createRoot } from "react-dom/client";
import { ShowroomFrame } from "../app/showroom/ShowroomPresentation";
import { ShowroomHome } from "../app/showroom/ShowroomHome";
import { Showroom } from "../app/showroom/Showroom";
import { ShowroomProductDetail } from "../app/showroom/ShowroomProductDetail";
import { ProductRecommendations } from "../app/showroom/ProductRecommendations";
import { Favorites } from "../app/showroom/Favorites";
import { Fitting } from "../app/showroom/Fitting";
import { Contacts } from "../app/showroom/Contacts";
import { ChatSelectionEntry } from "../app/showroom/ChatSelectionEntry";
import { TabState } from "../app/showroom/TabState";
import { browseInput, type PublicProductDetail } from "../lib/showroom/contracts";
import { favoriteKey, parseFavoriteQuery } from "../lib/showroom/favorites";
import { browseHref } from "../lib/showroom/navigation";
import "../app/globals.css";
import "../app/showroom/showroom.css";
import "../app/showroom/site.css";
const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const branches = [{ id: id(1), name: "Synthetic branch", city: "Synthetic city", timezone: "Asia/Almaty" }];
const products: PublicProductDetail[] = [2, 3, 4, 5].map(n => ({ id: id(n) + ":default", productId: id(n), executionId: null, name: "Synthetic dress " + n, color: "Розовый", execution: null, images: n === 2 ? [1,2].map(k => ({id:id(40+k),src:"/api/showroom/photo?synthetic="+k,alt:"Synthetic test image "+k,width:1,height:1})) : [], sizes: ["140", "146"], options: [{ id: id(n + 10), size: "140", sizeCode: "140" }, { id: id(n + 20), size: "146", sizeCode: "146" }] }));
let failedFavorites = false;
window.addEventListener("fixture-refresh", () => { failedFavorites = false; render(); });
window.addEventListener("fixture-favorites-fail", () => { failedFavorites = true; render(); });
const root = createRoot(document.getElementById("root")!);
function render() {
  const query = new URLSearchParams(location.search), filters = browseInput.parse(Object.fromEntries([...query].filter(([key]) => ["search", "categoryId", "page", "colorGroup", "size", "branchId", "from", "until"].includes(key))));
  const product = products.find(p => p.productId === query.get("productId"));
  const refs = parseFavoriteQuery(query.get("items") ?? undefined);
  const body = product ? <><a className="catalog-back" href={browseHref(filters)}>Вернуться в каталог</a><ShowroomProductDetail key={product.id + JSON.stringify(filters)} product={product} branches={branches} initialCriteria={filters} /><ProductRecommendations other={products.filter(p => p !== product)} complements={[]} filters={filters} /></>
    : query.get("view") === "favorites" ? <Favorites loadedKeys={refs.map(favoriteKey).join(",")} results={refs.map(ref => ({ ref, product: failedFavorites ? null : products.find(p => p.productId === ref.productId) ?? null, unavailable: false }))} />
      : query.get("view") === "contacts" ? <Contacts /> : query.get("view") === "fitting" ? <Fitting />
        : query.get("view") === "catalog" ? <Showroom catalog={{ items: products.map(p => ({ ...p, ...(filters.branchId ? {priceSummary:{minAmountMinor:"2500",maxAmountMinor:"2500",currency:"KZT",incomplete:false}} : {}) })), page: 1, more: false }} categories={[]} filters={filters} branches={branches} /> : <ShowroomHome items={products} />;
  root.render(<TabState scope="synthetic-browser-only" deadline={Number.MAX_SAFE_INTEGER}><ShowroomFrame intro={false}><ChatSelectionEntry availability="off" branches={branches} />{body}</ShowroomFrame></TabState>);
}
window.addEventListener("popstate", render);
document.addEventListener("click", event => {
  const anchor = (event.target as Element).closest("a");
  if (!anchor || anchor.target || new URL(anchor.href).origin !== location.origin || !new URL(anchor.href).pathname.startsWith("/showroom")) return;
  event.preventDefault(); history.pushState({}, "", anchor.href); window.dispatchEvent(new PopStateEvent("popstate"));
});
document.addEventListener("submit", event => {
  const form = event.target as HTMLFormElement;
  if (event.defaultPrevented || form.method !== "get") return;
  event.preventDefault(); history.pushState({}, "", "/showroom?" + new URLSearchParams(new FormData(form) as never)); window.dispatchEvent(new PopStateEvent("popstate"));
});
render();
