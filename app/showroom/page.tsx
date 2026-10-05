import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { publicBranches, publicBrowse, publicCategories, publicProduct, ShowroomError } from "@/lib/showroom/service";
import { browseInput } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { ChatSelectionEntry } from "./ChatSelectionEntry";
import { assistantConfigured } from "@/lib/assistant/chat/access";
import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { Showroom } from "./Showroom";
import { ShowroomProductDetail } from "./ShowroomProductDetail";
import { ShowroomFrame } from "./ShowroomPresentation";
import { ShowroomHome } from "./ShowroomHome";
import { categoryTree } from "@/lib/showroom/categories";
import { Favorites } from "./Favorites";
import { favoriteKey, parseFavoriteQuery } from "@/lib/showroom/favorites";
import { resolveFavoriteProducts } from "@/lib/showroom/favorite-resolution";
import { ProductRecommendations } from "./ProductRecommendations";
import { Contacts } from "./Contacts";
import { Fitting } from "./Fitting";
import "./showroom.css";
import "./site.css";
import { TabState } from "./TabState";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MARIPOSA — праздничные платья в аренду", robots: { index: false, follow: false } };
type Params = Record<string, string | string[] | undefined>;
async function chatAvailability(): Promise<{ availability: "off" | "login" | "ready" | "forbidden"; storageScope?: string; sessionExpiresAt?: number }> {
  if (!assistantConfigured()) return { availability: "off" };
  const session = await getCurrentSession();
  if (!session) return { availability: "login" };
  if (!await hasPermission(session, "CATALOG_VIEW")) return { availability: "forbidden" };
  return { availability: "ready", storageScope: createHash("sha256").update([session.organizationId, session.userId, session.sessionId].join(":")).digest("hex"), sessionExpiresAt: session.expiresAt.getTime() };
}
async function loadPage(params: Params, home: boolean) {
  try {
    const parsed = browseInput.safeParse({ search: params.search, categoryId: params.categoryId, page: params.page, colorGroup: params.colorGroup, size: params.size, branchId: params.branchId, from: params.from, until: params.until });
    if (!parsed.success) throw new ShowroomError("Проверьте параметры поиска.");
    const filters = parsed.data;
    const branches = await publicBranches();
    if (!branches.length) return { kind: "message" as const, message: "Публичные филиалы пока не открыты." };
    if (params.view === "favorites") {
      const refs = parseFavoriteQuery(params.items);
      const results = await resolveFavoriteProducts(params.items);
      const assistant = await chatAvailability().catch(() => ({ availability: "off" as const }));
      return { kind: "favorites" as const, results, loadedKeys: refs.map(favoriteKey).join(","), branches, assistant };
    }
    if (params.productId !== undefined) {
      const product = await publicProduct({ productId: params.productId, executionId: params.executionId });
      const assistant = await chatAvailability().catch(() => ({ availability: "off" as const }));
      const roots = categoryTree(await publicCategories());
      const dress = roots.find(node => /плать/iu.test(node.label));
      const additions = roots.filter(node => /обув|аксессуар/iu.test(node.label)).slice(0, 2);
      const sample = async (key: string) => publicBrowse({ categoryId: key }).then(value => value.items.filter(item => item.productId !== product.productId).slice(0, 4)).catch(() => []);
      const [other, complements] = await Promise.all([dress ? sample(dress.key) : Promise.resolve([]), Promise.all(additions.map(node => sample(node.key))).then(groups => groups.flat().slice(0, 4))]);
      return { kind: "product" as const, product, branches, filters, assistant, other, complements };
    }
    const categories = await publicCategories();
    const dressCategory = categoryTree(categories).find(node => /плать/iu.test(node.label));
    const homeFilters = { ...filters, categoryId: dressCategory?.key ?? "" };
    // No popularity statistics implied. Bounded public catalogue sample until owner curates it.
    const [catalog, assistant] = await Promise.all([home && !dressCategory ? Promise.resolve({ items: [], more: false, page: 1 }) : publicBrowse(home ? homeFilters : filters), chatAvailability().catch(() => ({ availability: "off" as const }))]);
    return { kind: "catalog" as const, catalog, categories, filters, assistant, branches };
  } catch (error) {
    return { kind: "message" as const, message: error instanceof ShowroomError ? error.message : "Витрина временно недоступна. Попробуйте позже." };
  }
}
export default async function ShowroomPage(props: { searchParams: Promise<Params> }) {
  const session = await getCurrentSession().catch(() => null);
  const scope = createHash("sha256").update(JSON.stringify([process.env.STOREFRONT_ORGANIZATION_ID ?? "unconfigured", session?.organizationId ?? "guest", session?.userId ?? "guest", session?.sessionId ?? "guest"])).digest("hex");
  return <TabState key={scope} scope={scope} deadline={session?.expiresAt.getTime() ?? Number.MAX_SAFE_INTEGER}>{await ShowroomContent(props)}</TabState>;
}
async function ShowroomContent({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  if (params.view === "contacts" || params.view === "fitting") return <ShowroomFrame intro={false}><ChatSelectionEntry availability="off" branches={[]} />{params.view === "contacts" ? <Contacts /> : <Fitting />}</ShowroomFrame>;
  const home = !["view", "search", "categoryId", "page", "productId", "colorGroup", "size", "branchId", "from", "until"].some(key => params[key] !== undefined);
  const data = await loadPage(params, home);
  if (data.kind === "message") return <ShowroomFrame intro={false}><ChatSelectionEntry availability="off" branches={[]} />{home ? <ShowroomHome items={[]} catalogUnavailable /> : <><p className="showroom-empty" role="alert">{data.message}</p><Link href="/showroom?view=catalog">Вернуться в каталог</Link></>}</ShowroomFrame>;
  if (data.kind === "favorites") return <ShowroomFrame intro={false}><ChatSelectionEntry {...data.assistant} branches={data.branches} /><Favorites results={data.results} loadedKeys={data.loadedKeys} /></ShowroomFrame>;
  if (data.kind === "product") return <ShowroomFrame intro={false}><ChatSelectionEntry {...data.assistant} branches={data.branches} /><Link className="catalog-back" href={params.back === "favorites" ? "/showroom?view=favorites" : browseHref(data.filters)}>{params.back === "favorites" ? "← В избранное" : "← Вернуться в каталог"}</Link><ShowroomProductDetail key={data.product.id + JSON.stringify(data.filters)} product={data.product} branches={data.branches} initialCriteria={data.filters} /><ProductRecommendations other={data.other} complements={data.complements} /></ShowroomFrame>;
  return <ShowroomFrame intro={false}><ChatSelectionEntry {...data.assistant} branches={data.branches} />{home ? <ShowroomHome items={data.catalog.items.slice(0, 4)} /> : <><div className="catalog-title-row"><h1 className="catalog-title">Каталог платьев</h1></div><Showroom catalog={data.catalog} categories={data.categories} filters={data.filters} branches={data.branches} /></>}</ShowroomFrame>;
}
