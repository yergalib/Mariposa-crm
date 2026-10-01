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
import "./showroom.css";
import "./site.css";
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
    const parsed = browseInput.safeParse({ search: params.search, categoryId: params.categoryId, page: params.page });
    if (!parsed.success) throw new ShowroomError("Проверьте параметры поиска.");
    const filters = parsed.data;
    const branches = await publicBranches();
    if (!branches.length) return { kind: "message" as const, message: "Публичные филиалы пока не открыты." };
    if (params.productId !== undefined) {
      const product = await publicProduct({ productId: params.productId, executionId: params.executionId });
      const assistant = await chatAvailability().catch(() => ({ availability: "off" as const }));
      return { kind: "product" as const, product, branches, filters, assistant };
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
export default async function ShowroomPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const home = !["view", "search", "categoryId", "page", "productId"].some(key => params[key] !== undefined);
  const data = await loadPage(params, home);
  if (data.kind === "message") return <ShowroomFrame intro={false}><ChatSelectionEntry availability="off" branches={[]} />{home ? <ShowroomHome items={[]} catalogUnavailable /> : <><p className="showroom-empty" role="alert">{data.message}</p><Link href="/showroom?view=catalog">Вернуться в каталог</Link></>}</ShowroomFrame>;
  if (data.kind === "product") return <ShowroomFrame intro={false}><ChatSelectionEntry {...data.assistant} branches={data.branches} /><Link className="catalog-back" href={browseHref(data.filters)}>← Вернуться в каталог</Link><ShowroomProductDetail key={data.product.id} product={data.product} branches={data.branches} /></ShowroomFrame>;
  return <ShowroomFrame intro={false}><ChatSelectionEntry {...data.assistant} branches={data.branches} />{home ? <ShowroomHome items={data.catalog.items.slice(0, 4)} /> : <><div className="catalog-title-row"><h1 className="catalog-title">Каталог платьев</h1></div><Showroom catalog={data.catalog} categories={data.categories} filters={data.filters} branches={data.branches} /></>}</ShowroomFrame>;
}
