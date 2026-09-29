"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { resolveOperationalIdentifier } from "@/lib/inventory/operational-identifier";
import { InventoryError } from "@/lib/inventory/errors";
import { resolveOperationalContext } from "@/lib/inventory/operational-context";
import type { OperationalActionResult, OperationalContextActionResult, OperationalSearchHit, ScanPurpose, StocktakeRecordActionResult } from "@/lib/inventory/operational-contract";
import { scanBarcode, setBulkCount } from "@/lib/stocktake/management";
import { requireBranchAccess } from "@/lib/staff/branch-access";
import { StaffError } from "@/lib/staff/errors";
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

export async function resolveOrderIdentifierAction(rawIdentifier: string, branchId: string): Promise<OperationalActionResult> {
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false, error: "UNAUTHORIZED", message: "Войдите в CRM и повторите поиск." };
    await requirePermission(session, "ORDER_CREATE");
    const tenant = createTenantContext(session.organizationId);
    await requireBranchAccess(tenant, session.membershipId, branchId);
    const result = await resolveOperationalIdentifier(tenant, { rawIdentifier, purpose: "ORDER_ITEM_SELECT", branchId }, session);
    return { ok: true, result };
  } catch (error) {
    if (error instanceof FulfillmentError || error instanceof StaffError) return { ok: false, error: error.code === "FORBIDDEN" ? "FORBIDDEN" : "INVALID_INPUT", message: error.code === "FORBIDDEN" ? "Недостаточно прав для создания заказа." : error.message };
    return { ok: false, error: "SERVER_ERROR", message: "Не удалось найти товар для заказа." };
  }
}

export async function resolveFulfillmentIdentifierAction(rawIdentifier: string, branchId: string): Promise<OperationalActionResult> {
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false, error: "UNAUTHORIZED", message: "Войдите в CRM и повторите поиск." };
    await requirePermission(session, "SALE_FULFILL");
    const tenant = createTenantContext(session.organizationId);
    await requireBranchAccess(tenant, session.membershipId, branchId);
    const result = await resolveOperationalIdentifier(tenant, { rawIdentifier, purpose: "FULFILLMENT_ISSUE", branchId }, session);
    return { ok: true, result };
  } catch (error) {
    if (error instanceof FulfillmentError || error instanceof StaffError) return { ok: false, error: error.code === "FORBIDDEN" ? "FORBIDDEN" : "INVALID_INPUT", message: error.code === "FORBIDDEN" ? "Недостаточно прав для передачи продажи." : error.message };
    return { ok: false, error: "SERVER_ERROR", message: "Не удалось проверить товар для передачи." };
  }
}

export async function resolveOperationalContextAction(rawIdentifier:string,purpose:"RETURN_RECEIVE"|"WAREHOUSE_LOOKUP"|"STOCKTAKE_COUNT",stocktakeSessionId?:string):Promise<OperationalContextActionResult>{
  try{
    const session=await getCurrentSession();
    if(!session)return{ok:false,error:"UNAUTHORIZED",message:"Войдите в CRM и повторите поиск."};
    const resolved=await resolveOperationalContext(createTenantContext(session.organizationId),{rawIdentifier,purpose,stocktakeSessionId},session);
    return{ok:true,...resolved};
  }catch(error){
    if(error instanceof FulfillmentError)return{ok:false,error:error.code==="FORBIDDEN"?"FORBIDDEN":"INVALID_INPUT",message:error.code==="FORBIDDEN"?"Недостаточно прав для этой операции.":error.message};
    return{ok:false,error:"SERVER_ERROR",message:"Не удалось выполнить поиск. Попробуйте ещё раз."};
  }
}

export async function recordStocktakeItemAction(stocktakeSessionId:string,rawIdentifier:string,count?:number):Promise<StocktakeRecordActionResult>{
  try{
    const session=await getCurrentSession();
    if(!session)return{ok:false,error:"UNAUTHORIZED",message:"Войдите в CRM и повторите подсчёт."};
    await requirePermission(session,"STOCKTAKE_COUNT");
    const tenant=createTenantContext(session.organizationId);
    const stocktake=await db.stocktakeSession.findFirst({where:{id:stocktakeSessionId,organizationId:session.organizationId,status:"IN_PROGRESS"},select:{branchId:true}});
    if(!stocktake)return{ok:false,error:"INVALID_INPUT",message:"Подсчёт уже закрыт или недоступен."};
    await requireBranchAccess(tenant,session.membershipId,stocktake.branchId);
    const resolved=await resolveOperationalContext(tenant,{rawIdentifier,purpose:"STOCKTAKE_COUNT",stocktakeSessionId},session);
    if(resolved.result.kind==="BULK_VARIANT"){
      if(!Number.isInteger(count)||Number(count)<0)return{ok:false,error:"INVALID_INPUT",message:"Введите фактическое количество целым числом."};
      await setBulkCount(tenant,stocktakeSessionId,resolved.result.variant.id,Number(count),{userId:session.userId});
    }else if(resolved.result.kind==="SERIALIZED_INSTANCE")await scanBarcode(tenant,stocktakeSessionId,resolved.result.instance.barcode,{userId:session.userId});
    else return{ok:false,error:"INVALID_INPUT",message:"Сначала выберите конкретный вариант."};
    const refreshed=await resolveOperationalContext(tenant,{rawIdentifier,purpose:"STOCKTAKE_COUNT",stocktakeSessionId},session);
    if(!refreshed.context||!(refreshed.context.kind==="STOCKTAKE_BULK"||refreshed.context.kind==="STOCKTAKE_SERIALIZED"))return{ok:false,error:"SERVER_ERROR",message:"Не удалось подтвердить результат подсчёта."};
    revalidatePath(`/warehouse/stocktakes/${stocktakeSessionId}`);
    return{ok:true,result:refreshed.result,context:refreshed.context,message:refreshed.context.kind==="STOCKTAKE_BULK"?"Количество сохранено.":refreshed.context.alreadyObserved?"Экземпляр учтён.":"Экземпляр сохранён."};
  }catch(error){
    if(error instanceof FulfillmentError||error instanceof InventoryError||error instanceof StaffError)return{ok:false,error:error.code==="FORBIDDEN"?"FORBIDDEN":"INVALID_INPUT",message:error.code==="FORBIDDEN"?"Недостаточно прав для подсчёта.":error.message};
    return{ok:false,error:"SERVER_ERROR",message:"Не удалось сохранить подсчёт. Попробуйте ещё раз."};
  }
}

export async function searchOperationalItemsAction(rawQuery: string,purpose:ScanPurpose="CATALOG_LOOKUP",branchId?:string): Promise<{ ok: true; results: OperationalSearchHit[] } | { ok: false; message: string }> {
  const query = rawQuery.trim().slice(0, 100);
  if (query.length < 2) return { ok: true, results: [] };
  try {
    const session = await getCurrentSession();
    if (!session) return { ok: false, message: "Войдите в CRM и повторите поиск." };
    if(purpose==="ORDER_ITEM_SELECT"){
      await requirePermission(session,"ORDER_CREATE");
      if(!branchId)return{ok:false,message:"Сначала выберите филиал."};
      await requireBranchAccess(createTenantContext(session.organizationId),session.membershipId,branchId);
    }else if(purpose==="FULFILLMENT_ISSUE"){
      await requirePermission(session,"SALE_FULFILL");
      if(!branchId)return{ok:false,message:"Филиал продажи не выбран."};
      await requireBranchAccess(createTenantContext(session.organizationId),session.membershipId,branchId);
    }else if(purpose==="RETURN_RECEIVE")await requirePermission(session,"RETURN_PROCESS");
    else if(purpose==="WAREHOUSE_LOOKUP")await requirePermission(session,"INVENTORY_VIEW");
    else if(purpose==="STOCKTAKE_COUNT")await requirePermission(session,"STOCKTAKE_COUNT");
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
