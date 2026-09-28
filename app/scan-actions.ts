"use server";

import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { resolveOperationalIdentifier } from "@/lib/inventory/operational-identifier";
import { resolveOperationalContext } from "@/lib/inventory/operational-context";
import type { OperationalActionResult, OperationalContextActionResult, OperationalSearchHit, ScanPurpose } from "@/lib/inventory/operational-contract";
import { requirePermission } from "@/lib/permissions/effective";
import { createTenantContext } from "@/lib/tenant/context";

export async function resolveCatalogIdentifierAction(rawIdentifier: string): Promise<OperationalActionResult> {
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false, error: "UNAUTHORIZED", message: "Войдите в CRM и повторите поиск." };
    const result = await resolveOperationalIdentifier(createTenantContext(session.organizationId), { rawIdentifier, purpose: "CATALOG_LOOKUP" }, session);
    return { ok: true, result };
  } catch (error) {
    if (error instanceof FulfillmentError) return { ok: false, error: error.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED", message: "Поиск недоступен для этой учётной записи." };
    return { ok: false, error: "SERVER_ERROR", message: "Не удалось выполнить поиск. Попробуйте ещё раз." };
  }
}

export async function resolveOperationalContextAction(rawIdentifier:string,purpose:"RETURN_RECEIVE"|"WAREHOUSE_LOOKUP"):Promise<OperationalContextActionResult>{
  try{
    const session=await getCurrentSession();
    if(!session)return{ok:false,error:"UNAUTHORIZED",message:"Войдите в CRM и повторите поиск."};
    const resolved=await resolveOperationalContext(createTenantContext(session.organizationId),{rawIdentifier,purpose},session);
    return{ok:true,...resolved};
  }catch(error){
    if(error instanceof FulfillmentError)return{ok:false,error:error.code==="FORBIDDEN"?"FORBIDDEN":"INVALID_INPUT",message:error.code==="FORBIDDEN"?"Недостаточно прав для этой операции.":error.message};
    return{ok:false,error:"SERVER_ERROR",message:"Не удалось выполнить поиск. Попробуйте ещё раз."};
  }
}

export async function searchOperationalItemsAction(rawQuery: string,purpose:ScanPurpose="CATALOG_LOOKUP"): Promise<{ ok: true; results: OperationalSearchHit[] } | { ok: false; message: string }> {
  const query = rawQuery.trim().slice(0, 100);
  if (query.length < 2) return { ok: true, results: [] };
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false, message: "Войдите в CRM и повторите поиск." };
    if(purpose==="RETURN_RECEIVE")await requirePermission(session,"RETURN_PROCESS");
    else if(purpose==="WAREHOUSE_LOOKUP")await requirePermission(session,"INVENTORY_VIEW");
    else await requirePermission(session, "CATALOG_VIEW");
    const products = await db.product.findMany({
      where: { organizationId: session.organizationId, archivedAt: null, publicationStatus: "ACTIVE", OR: [{ name: { contains: query, mode: "insensitive" } }, { internalCode: { contains: query, mode: "insensitive" } }, { variants: { some: { organizationId: session.organizationId, sku: { contains: query, mode: "insensitive" }, isActive: true } } }] },
      select: { id: true, name: true, internalCode: true, trackingMode: true, variants: { where: { organizationId: session.organizationId, isActive: true }, select: { id: true, sku: true, execution: { select: { id: true, name: true } }, size: { select: { code: true, name: true, sizeSystem: true, recommendedHeightCm: true, lengthCm: true } } }, orderBy: [{ execution: { sortOrder: "asc" } }, { size: { sortOrder: "asc" } }], take: 12 } },
      orderBy: [{ name: "asc" }, { internalCode: "asc" }], take: 12
    });
    const results = products.flatMap<OperationalSearchHit>(product => product.variants.length ? product.variants.map(variant => ({ product: { id: product.id, name: product.name, code: product.internalCode }, trackingMode: product.trackingMode, variant })) : [{ product: { id: product.id, name: product.name, code: product.internalCode }, trackingMode: product.trackingMode, variant: null }]);
    return { ok: true, results: results.slice(0, 30) };
  } catch {
    return { ok: false, message: "Не удалось выполнить поиск. Попробуйте ещё раз." };
  }
}
