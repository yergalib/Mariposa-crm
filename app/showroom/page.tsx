import type { Metadata } from "next";
import Link from "next/link";
import { publicBranches, publicBrowse, publicCategories, publicProduct, ShowroomError } from "@/lib/showroom/service";
import { browseInput } from "@/lib/showroom/contracts";
import { browseHref } from "@/lib/showroom/navigation";
import { SelectionConsultation } from "./SelectionConsultation";
import { Showroom } from "./Showroom";
import { ShowroomProductDetail } from "./ShowroomProductDetail";
import { ShowroomFrame } from "./ShowroomPresentation";
import "./showroom.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MARIPOSA — каталог платьев", robots: { index: false, follow: false } };
type Params = Record<string, string | string[] | undefined>;
async function loadPage(params: Params) {
  try {
    const parsed = browseInput.safeParse({ search: params.search, categoryId: params.categoryId, page: params.page });
    if (!parsed.success) throw new ShowroomError("Проверьте параметры поиска.");
    const filters = parsed.data;
    const branches = await publicBranches();
    if (!branches.length) return { kind: "message" as const, message: "Публичные филиалы пока не открыты." };
    if (params.productId !== undefined) {
      const product = await publicProduct({ productId: params.productId, executionId: params.executionId });
      return { kind: "product" as const, product, branches, filters };
    }
    const [catalog, categories] = await Promise.all([publicBrowse(filters), publicCategories()]);
    return { kind: "catalog" as const, catalog, categories, filters, branches };
  } catch (error) {
    return { kind: "message" as const, message: error instanceof ShowroomError ? error.message : "Витрина временно недоступна. Попробуйте позже." };
  }
}
export default async function ShowroomPage({ searchParams }: { searchParams: Promise<Params> }) {
  const data = await loadPage(await searchParams);
  if (data.kind === "message") return <ShowroomFrame><p className="showroom-empty" role="alert">{data.message}</p><Link href="/showroom">Вернуться в каталог</Link></ShowroomFrame>;
  if (data.kind === "product") return <ShowroomFrame intro={false}><Link className="catalog-back" href={browseHref(data.filters)}>← Вернуться в каталог</Link><ShowroomProductDetail key={data.product.id} product={data.product} branches={data.branches} /></ShowroomFrame>;
  return <ShowroomFrame intro={false}><SelectionConsultation branches={data.branches} /><h1 className="catalog-title">Каталог</h1><Showroom catalog={data.catalog} categories={data.categories} filters={data.filters} /></ShowroomFrame>;
}
