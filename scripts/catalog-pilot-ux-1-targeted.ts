import "dotenv/config";
import { readFileSync } from "node:fs";

import { db } from "../lib/db";
import { catalogSizeLabel } from "../lib/catalog/labels";
import { getCatalogProductById, getCatalogProducts } from "../lib/catalog/queries";
import { createTenantContext } from "../lib/tenant/context";

const passed: string[] = [];
const pass = (name: string, value: unknown) => { if (!value) throw new Error(`FAIL ${name}`); passed.push(name); };
const quantity = (variant: { quantity: number }) => variant.quantity;

async function main() {
  const organization = await db.organization.findUniqueOrThrow({ where: { slug: "mariposa-pilot" }, select: { id: true } });
  const membership = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: organization.id, status: "ACTIVE", role: "OWNER" }, select: { defaultBranchId: true } });
  const tenant = createTenantContext(organization.id);
  const products = await getCatalogProducts({ tenant, defaultBranchId: membership.defaultBranchId });
  pass("ten real products listed", products.length === 10);
  pass("all pilot totals reconcile", products.every((product) => product.variantGroups.reduce((sum, group) => sum + group.variants.reduce((total, variant) => total + quantity(variant), 0), 0) === (product.trackingMode === "BULK" ? product.totalStock : product.totalInstances)));
  const dress = products.find((product) => product.name === "Платье 5380")!;
  pass("execution grouping", dress.variantGroups.length === 3 && dress.variantGroups.map((group) => group.execution?.name).join("|") === "Белый|Розовый|Шампань");
  pass("repeated sizes remain inside executions", dress.variantGroups.filter((group) => group.variants.some((variant) => variant.size.code === "120")).length === 3);
  pass("no duplicated sizes inside execution", dress.variantGroups.every((group) => new Set(group.variants.map((variant) => variant.size.code)).size === group.variants.length));
  pass("card execution totals reconcile", dress.variantGroups.reduce((sum, group) => sum + group.variants.reduce((total, variant) => total + quantity(variant), 0), 0) === dress.totalStock);
  const direct = products.find((product) => product.name === "Атомайзер")!;
  pass("product without execution grouped directly", direct.variantGroups.length === 1 && direct.variantGroups[0].execution === null);
  pass("volume labels", direct.variantGroups[0].variants.every((variant) => catalogSizeLabel(variant.size).primary.endsWith("мл")));
  const ring = products.find((product) => product.name === "Колечко")!;
  pass("ONE_SIZE hidden", catalogSizeLabel(ring.variantGroups[0].variants[0].size).primary === "Без размера");
  pass("manufacturer height label", catalogSizeLabel({ code: "7", sizeSystem: "MANUFACTURER_SIZE", recommendedHeightCm: 110 }).secondary === "рост 110 см");
  pass("manufacturer length label", catalogSizeLabel({ code: "2", sizeSystem: "MANUFACTURER_SIZE", lengthCm: 11 }).secondary === "11 см");
  pass("digit remains original", catalogSizeLabel({ code: "5", sizeSystem: "DIGIT" }).primary === "5");

  const dressRow = await db.product.findFirstOrThrow({ where: { organizationId: organization.id, name: "Платье 5380" }, select: { id: true } });
  const detail = await getCatalogProductById({ tenant, defaultBranchId: membership.defaultBranchId, productId: dressRow.id });
  pass("detail loads", detail?.name === "Платье 5380");
  const detailTotal = detail!.variants.reduce((sum, variant) => sum + variant.stockLevels.reduce((value, level) => value + level.quantity, 0), 0);
  pass("detail total reconciles", detailTotal === 34);
  pass("detail execution totals reconcile", detail!.executions.every((execution) => detail!.variants.filter((variant) => variant.execution?.id === execution.id).reduce((sum, variant) => sum + variant.stockLevels.reduce((value, level) => value + level.quantity, 0), 0) > 0));

  const page = readFileSync("app/products/[id]/page.tsx", "utf8");
  const list = readFileSync("app/products/page.tsx", "utf8");
  const catalogCss = readFileSync("app/catalog.css", "utf8");
  const globalCss = readFileSync("app/globals.css", "utf8");
  pass("management is collapsed", page.includes('<details className="card product-management">'));
  pass("management remains permission gated", page.includes("(catalog||inventory||photos)&&<details"));
  pass("economics remains permission derived", page.includes("economics&&<EconomicsSection"));
  pass("economics detail is collapsed", page.includes('className="economics-detail"'));
  pass("empty prices omitted", list.includes("(product.rentalPrice||product.salePrice)&&"));
  pass("list uses execution groups", list.includes("product.variantGroups.map"));
  pass("catalog shows quantity per variant", list.includes("<em>×{variant.quantity}</em>"));
  pass("normal catalog omits tracking row", !list.includes('className="stock-line"') && !list.includes("Количественный учёт") && !list.includes("Поэкземплярный учёт"));
  pass("operational view has no horizontal table", page.includes("operational-variants") && !page.includes("variant-table"));
  pass("detail uses compact availability chips", page.includes('className="availability-chip"') && page.includes("×{quantity(variant)}"));
  pass("economics collapsed summary is compact", page.includes('<summary><b>Экономика товара</b><span aria-hidden="true">›</span></summary>') && !page.includes('className="economics-summary-count"'));
  pass("connection-pool fix retained", !page.includes("Promise.all([getCatalogProductById"));
  pass("390px compact card", catalogCss.includes(".product-card { display:grid; grid-template-columns:70px minmax(0,1fr); }"));
  pass("mobile chips wrap without page overflow", catalogCss.includes(".operational-variants { display:flex; flex-wrap:wrap") && catalogCss.includes("max-width:100%"));
  pass("760px mobile breakpoint", catalogCss.includes("@media(max-width:760px)") && catalogCss.includes(".operational-product-hero { grid-template-columns:86px"));
  pass("768px tablet grid", globalCss.includes("@media(max-width:1000px)") && globalCss.includes(".product-grid{grid-template-columns:1fr 1fr}"));
  pass("1024px and desktop use fluid grids", globalCss.includes(".product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))") && catalogCss.includes("repeat(auto-fit,minmax(240px,1fr))"));

  console.log(`CATALOG PILOT UX-1 targeted: ${passed.length}/${passed.length} passed`);
  console.log(passed);
}

main().finally(async () => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
