import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { publicBranches, publicBrowse, publicHomePhotoCards, publicCategories, publicProduct, ShowroomError } from "@/lib/showroom/service";
import { colorPhotoCards } from "@/lib/showroom/color-cards";
import { browseInput } from "@/lib/showroom/contracts";
import { defaultBranchId } from "@/lib/showroom/catalog-filters";
import { browseHref } from "@/lib/showroom/navigation";
import { ChatSelectionEntry } from "./ChatSelectionEntry";
import { assistantConfigured, assertAssistantStaff } from "@/lib/assistant/chat/access";
import { historyEnabled, historyHandoffEnabled } from '@/lib/assistant/history/access';
import { pilotTestRequested } from '@/lib/assistant/pilot-test-config';
import { ownerMainRestricted } from '@/lib/assistant/owner-day-config';
import { requireOwnerDaySession } from '@/lib/assistant/owner-day-access';
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
import "./editorial.css";
import { TabState } from "./TabState";
import { InquiryAccessProvider } from './InquiryAccess';
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MARIPOSA — праздничные платья в аренду", description: "MARIPOSA — аренда праздничных платьев, обуви и аксессуаров. Выберите наряд в каталоге и обсудите примерку с шоурумом. Наличие и условия подтверждает сотрудник.", robots: { index: false, follow: false } };
type Params = Record<string, string | string[] | undefined>;
async function chatAvailability(): Promise<{ availability: "off" | "login" | "ready" | "forbidden"; storageScope?: string; sessionExpiresAt?: number; historyEnabled?:boolean; historyHandoffEnabled?:boolean; ownerTest?:boolean }> {
  if (ownerMainRestricted()) {
    try {
      const session = await requireOwnerDaySession();
      return { availability: assistantConfigured() ? "ready" : "off", ownerTest: true,
        historyEnabled: true, historyHandoffEnabled: await hasPermission(session, "LEAD_CREATE") && await hasPermission(session, "LEAD_VIEW") };
    } catch { return { availability: "forbidden" }; }
  }
  if (pilotTestRequested()) return { availability: 'off' }; // Operator-only test has its own authenticated page.
  if (historyEnabled(process.env.STOREFRONT_ORGANIZATION_ID)) return { availability: 'off', historyEnabled: true, historyHandoffEnabled: historyHandoffEnabled(process.env.STOREFRONT_ORGANIZATION_ID) };
  if (!assistantConfigured()) return { availability: "off" };
  const session = await getCurrentSession();
  if (!session) return { availability: "login" };
  try { assertAssistantStaff(session); } catch { return { availability: "forbidden" }; }
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
    filters.branchId = defaultBranchId(branches, filters.branchId);
    if (params.view === "favorites") {
      const refs = parseFavoriteQuery(params.items);
      const results = await resolveFavoriteProducts(params.items);
      const assistant = await chatAvailability().catch(() => ({ availability: "off" as const }));
      return { kind: "favorites" as const, results, loadedKeys: refs.map(favoriteKey).join(","), branches, assistant };
    }
    if (params.productId !== undefined) {
      const product = await publicProduct({ productId: params.productId, executionId: params.executionId }, filters.branchId);
      const assistant = await chatAvailability().catch(() => ({ availability: "off" as const }));
      const roots = categoryTree(await publicCategories());
      const dress = roots.find(node => /плать/iu.test(node.label));
      const additions = roots.filter(node => /обув|аксессуар/iu.test(node.label)).slice(0, 2);
      const sample = async (key: string, accessory = false) => publicBrowse({ ...filters, search: "", categoryId: key, page: 1, ...(accessory ? { size: "", colorGroup: "" } : {}) }).then(value => value.items.filter(item => item.productId !== product.productId).slice(0, 4)).catch(() => []);
      const [other, complements] = await Promise.all([dress ? sample(dress.key) : Promise.resolve([]), Promise.all(additions.map(node => sample(node.key, true))).then(groups => groups.flat().slice(0, 4))]);
      return { kind: "product" as const, product, branches, filters, assistant, other, complements };
    }
    const categories = await publicCategories();
    const dressCategory = categoryTree(categories).find(node => /плать/iu.test(node.label));
    // Reuse the bounded public-photo scan once. No invented popularity, stock or branchless price.
    const [catalog, assistant] = await Promise.all([home
      ? (dressCategory ? publicHomePhotoCards(dressCategory.key) : Promise.resolve([])).then(items => ({ items, more: false, page: 1 }))
      : publicBrowse(filters), chatAvailability().catch(() => ({ availability: "off" as const }))]);
    return { kind: "catalog" as const, catalog, categories, filters, assistant, branches, colorCards: home ? colorPhotoCards(catalog.items) : [] };
  } catch (error) {
    return { kind: "message" as const, message: error instanceof ShowroomError ? error.message : "Витрина временно недоступна. Попробуйте позже." };
  }
}
export default async function ShowroomPage(props: { searchParams: Promise<Params> }) {
  if (ownerMainRestricted()) {
    try { await requireOwnerDaySession(); }
    catch { return <main><h1>Владельческий тест MARIPOSA</h1><p>Доступен только разрешённому владельцу 21 октября по времени Алматы.</p><Link href="/login">Войти в CRM</Link></main>; }
  }
  // Temporary opt-in Preview diagnostic: only public system identifiers, no env dump.
  if (process.env.VERCEL_ENV === "preview" && process.env.MARIPOSA_PREVIEW_REF_DIAGNOSTIC === "1") {
    console.info("MARIPOSA_PREVIEW_RUNTIME_REF " + JSON.stringify({
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    }));
  }
  const session = await getCurrentSession().catch(() => null);
  const scope = createHash("sha256").update(JSON.stringify([process.env.STOREFRONT_ORGANIZATION_ID ?? "unconfigured", session?.organizationId ?? "guest", session?.userId ?? "guest", session?.sessionId ?? "guest"])).digest("hex");
  const intake = ownerMainRestricted() && Boolean(session) && await hasPermission(session!, 'LEAD_VIEW') && await hasPermission(session!, 'LEAD_CREATE');
  return <TabState key={scope} scope={scope} deadline={session?.expiresAt.getTime() ?? Number.MAX_SAFE_INTEGER}><InquiryAccessProvider enabled={intake}>{await ShowroomContent(props)}</InquiryAccessProvider></TabState>;
}
async function ShowroomContent({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  if (params.view === "contacts" || params.view === "fitting") { const branches=await publicBranches(); const assistant=await chatAvailability(); return <ShowroomFrame intro={false}><ChatSelectionEntry {...assistant} branches={branches} />{params.view === "contacts" ? <Contacts /> : <Fitting branches={branches} />}</ShowroomFrame>; }
  const home = !["view", "search", "categoryId", "page", "productId", "colorGroup", "size", "branchId", "from", "until"].some(key => params[key] !== undefined);
  const data = await loadPage(params, home);
  if (data.kind === "message") return <ShowroomFrame intro={false}><ChatSelectionEntry availability="off" branches={[]} />{home ? <ShowroomHome items={[]} catalogUnavailable /> : <><p className="showroom-empty" role="alert">{data.message}</p><Link href="/showroom?view=catalog">Вернуться в каталог</Link></>}</ShowroomFrame>;
  if (data.kind === "favorites") return <ShowroomFrame intro={false}><ChatSelectionEntry {...data.assistant} branches={data.branches} /><Favorites results={data.results} loadedKeys={data.loadedKeys} /></ShowroomFrame>;
  if (data.kind === "product") return <ShowroomFrame intro={false}><ChatSelectionEntry {...data.assistant} branches={data.branches} /><Link className="catalog-back" href={params.back === "favorites" ? "/showroom?view=favorites" : browseHref(data.filters)}>{params.back === "favorites" ? "← В избранное" : "← Вернуться в каталог"}</Link><ShowroomProductDetail key={data.product.id + JSON.stringify(data.filters)} product={data.product} branches={data.branches} initialCriteria={data.filters} /><ProductRecommendations other={data.other} complements={data.complements} filters={data.filters} /></ShowroomFrame>;
  return <ShowroomFrame intro={false}><ChatSelectionEntry {...data.assistant} branches={data.branches} />{home ? <ShowroomHome items={data.catalog.items} colorCards={data.colorCards} /> : <><div className="catalog-title-row"><h1 className="catalog-title">Каталог</h1></div><Showroom catalog={data.catalog} categories={data.categories} filters={data.filters} branches={data.branches} /></>}</ShowroomFrame>;
}
