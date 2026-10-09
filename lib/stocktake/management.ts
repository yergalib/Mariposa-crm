import type {Prisma} from "@/generated/prisma/client";
import {lockCapacityResource} from "@/lib/inventory/capacity-lock";
import"server-only";import{db}from"@/lib/db";import type{TenantContext}from"@/lib/tenant/context";import{InventoryError}from"@/lib/inventory/errors";import{member}from"@/lib/inventory/ledger";import{PHYSICALLY_EXPECTED_STATUSES}from"@/lib/stocktake/policy";import{changeBulkWithClient,changeSerializedStatusWithClient,transferSerializedWithClient}from"@/lib/inventory/management";import{getActiveBulkMaintenanceQuantity}from"@/lib/inventory/bulk-maintenance-state";import{getActiveSaleCommitmentQuantity}from"@/lib/sales/guards";
type Actor={userId:string};
async function session(o:string,id:string){const s=await db.stocktakeSession.findFirst({where:{id,organizationId:o}});if(!s)throw new InventoryError("NOT_FOUND","Инвентаризация не найдена.");return s}
export async function startStocktake(t:TenantContext,i:{branchId:string;locationId:string;note?:string;idempotencyKey:string},a:Actor){return db.$transaction(async tx=>{await member(tx,t.organizationId,a.userId);const old=await tx.stocktakeSession.findFirst({where:{organizationId:t.organizationId,idempotencyKey:i.idempotencyKey}});if(old)return old;const loc=await tx.location.findFirst({where:{id:i.locationId,organizationId:t.organizationId,branchId:i.branchId,isActive:true}});if(!loc)throw new InventoryError("NOT_FOUND","Филиал или локация не найдены.");const s=await tx.stocktakeSession.create({data:{organizationId:t.organizationId,branchId:i.branchId,locationId:i.locationId,note:i.note?.trim()||null,idempotencyKey:i.idempotencyKey,startedByUserId:a.userId}});const expected=await tx.productInstance.findMany({where:{organizationId:t.organizationId,currentBranchId:i.branchId,currentLocationId:i.locationId,retiredAt:null,operationalStatus:{in:[...PHYSICALLY_EXPECTED_STATUSES]}},select:{id:true,currentBranchId:true,currentLocationId:true,operationalStatus:true,version:true}});if(expected.length)await tx.stocktakeExpectedItem.createMany({data:expected.map(x=>({organizationId:t.organizationId,sessionId:s.id,productInstanceId:x.id,expectedBranchId:x.currentBranchId,expectedLocationId:x.currentLocationId,expectedStatus:x.operationalStatus,expectedVersion:x.version}))});const bulk=await tx.stockLevel.findMany({where:{organizationId:t.organizationId,branchId:i.branchId,locationId:i.locationId,productVariant:{product:{trackingMode:"BULK"}}}});if(bulk.length)await tx.stocktakeBulkCount.createMany({data:bulk.map(x=>({organizationId:t.organizationId,sessionId:s.id,productVariantId:x.productVariantId,expectedQuantity:x.quantity,expectedUpdatedAt:x.updatedAt}))});return s},{maxWait:10000,timeout:30000})}
export async function scanBarcode(t:TenantContext,id:string,raw:string,a:Actor){const barcode=raw.trim().toUpperCase();if(!barcode)throw new InventoryError("INVALID","Введите штрихкод.");return db.$transaction(async tx=>{await member(tx,t.organizationId,a.userId);const s=await tx.stocktakeSession.findFirst({where:{id,organizationId:t.organizationId,status:"IN_PROGRESS"}});if(!s)throw new InventoryError("INVALID","Сканирование закрыто.");const x=await tx.productInstance.findFirst({where:{organizationId:t.organizationId,barcode}});if(!x)throw new InventoryError("NOT_FOUND","Штрихкод не найден.");const old=await tx.stocktakeScan.findUnique({where:{sessionId_productInstanceId:{sessionId:id,productInstanceId:x.id}}});if(old)return{...old,alreadyScanned:true};const expected=await tx.stocktakeExpectedItem.findUnique({where:{sessionId_productInstanceId:{sessionId:id,productInstanceId:x.id}}});const classification=expected?"MATCHED":x.currentBranchId!==s.branchId?"WRONG_BRANCH":x.currentLocationId!==s.locationId?"WRONG_LOCATION":"UNEXPECTED";const row=await tx.stocktakeScan.create({data:{organizationId:t.organizationId,sessionId:id,productInstanceId:x.id,classification,scannedByUserId:a.userId,observedVersion:x.version}});return{...row,alreadyScanned:false}},{maxWait:10000,timeout:30000})}
export async function setBulkCount(t:TenantContext,id:string,variantId:string,count:number,a:Actor){if(!Number.isInteger(count)||count<0)throw new InventoryError("INVALID","Количество не может быть отрицательным.");return db.$transaction(async tx=>{await member(tx,t.organizationId,a.userId);const s=await tx.stocktakeSession.findFirst({where:{id,organizationId:t.organizationId,status:"IN_PROGRESS"}});if(!s)throw new InventoryError("INVALID","Подсчёт закрыт.");const v=await tx.productVariant.findFirst({where:{id:variantId,organizationId:t.organizationId,product:{trackingMode:"BULK"}}});if(!v)throw new InventoryError("NOT_FOUND","BULK вариант не найден.");const level=await tx.stockLevel.findFirst({where:{organizationId:t.organizationId,branchId:s.branchId,locationId:s.locationId,productVariantId:variantId}});return tx.stocktakeBulkCount.upsert({where:{sessionId_productVariantId:{sessionId:id,productVariantId:variantId}},create:{organizationId:t.organizationId,sessionId:id,productVariantId:variantId,expectedQuantity:level?.quantity??0,expectedUpdatedAt:level?.updatedAt,countedQuantity:count},update:{countedQuantity:count}})})}
export async function completeCount(t:TenantContext,id:string,a:Actor){return db.$transaction(async tx=>{await member(tx,t.organizationId,a.userId);const s=await tx.stocktakeSession.findFirst({where:{id,organizationId:t.organizationId}});if(!s)throw new InventoryError("NOT_FOUND","Инвентаризация не найдена.");if(s.status==="COUNTED")return s;if(s.status!=="IN_PROGRESS")throw new InventoryError("INVALID","Подсчёт уже закрыт.");const counts=await tx.stocktakeBulkCount.findMany({where:{sessionId:id,organizationId:t.organizationId,countedQuantity:{not:null}},select:{productVariantId:true,countedQuantity:true}});for(const count of counts){const maintenance=await getActiveBulkMaintenanceQuantity(tx,{organizationId:t.organizationId,branchId:s.branchId,productVariantId:count.productVariantId,locationId:s.locationId});if((count.countedQuantity??0)<maintenance)throw new InventoryError("BLOCKED","Подсчёт меньше количества, зафиксированного в чистке или ремонте.");const other=await tx.stockLevel.aggregate({where:{organizationId:t.organizationId,branchId:s.branchId,productVariantId:count.productVariantId,locationId:{not:s.locationId}},_sum:{quantity:true}});const committed=await getActiveSaleCommitmentQuantity(tx,{organizationId:t.organizationId,branchId:s.branchId,productVariantId:count.productVariantId});if((count.countedQuantity??0)+(other._sum.quantity??0)<committed)throw new InventoryError("BLOCKED","Подсчёт меньше количества, закреплённого за подтверждёнными продажами.");}return tx.stocktakeSession.update({where:{id},data:{status:"COUNTED",completedAt:new Date(),completedByUserId:a.userId}})})}
export async function cancelStocktake(t:TenantContext,id:string,a:Actor){const s=await session(t.organizationId,id);if(s.status==="CANCELLED")return s;if(s.status!=="IN_PROGRESS")throw new InventoryError("INVALID","Инвентаризацию нельзя отменить.");return db.stocktakeSession.update({where:{id},data:{status:"CANCELLED",cancelledAt:new Date(),cancelledByUserId:a.userId}})}
async function lockResolution(tx:Prisma.TransactionClient,organizationId:string,id:string,recordId:string){
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId+":stocktake-resolution:"+id+":"+recordId},0))`;
}
async function lockInstance(tx:Prisma.TransactionClient,organizationId:string,x:{id:string;currentBranchId:string;productVariantId:string}){
 await lockCapacityResource(tx,organizationId,x.currentBranchId,x.productVariantId);
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId+":instance:"+x.id},0))`;
}
export async function resolveMissing(t:TenantContext,id:string,expectedId:string,action:"MARK_LOST"|"ACKNOWLEDGED",why:string,a:Actor){
 if(!["MARK_LOST","ACKNOWLEDGED"].includes(action)||!why.trim())throw new InventoryError("INVALID","Укажите решение и причину.");
 return db.$transaction(async tx=>{
  await member(tx,t.organizationId,a.userId);await lockResolution(tx,t.organizationId,id,expectedId);
  const initial=await tx.stocktakeExpectedItem.findFirst({where:{id:expectedId,organizationId:t.organizationId,sessionId:id},include:{productInstance:true}});
  if(!initial)throw new InventoryError("NOT_FOUND","Расхождение не найдено.");
  await lockInstance(tx,t.organizationId,initial.productInstance);
  const e=await tx.stocktakeExpectedItem.findFirst({where:{id:expectedId,organizationId:t.organizationId,sessionId:id},include:{session:true,productInstance:true}});
  if(!e)throw new InventoryError("NOT_FOUND","Расхождение не найдено.");
  if(e.resolution){if(e.resolution!==action||e.resolutionReason!==why)throw new InventoryError("INVALID","Расхождение уже решено с другими данными.");return e;}
  if(e.session.status!=="COUNTED")throw new InventoryError("NOT_FOUND","Расхождение не найдено.");
  if(await tx.stocktakeScan.findUnique({where:{sessionId_productInstanceId:{sessionId:id,productInstanceId:e.productInstanceId}}}))throw new InventoryError("INVALID","Экземпляр был отсканирован.");
  let m=null;
  if(action==="MARK_LOST"){
   if(e.productInstance.version!==e.expectedVersion||e.productInstance.currentBranchId!==e.expectedBranchId||e.productInstance.currentLocationId!==e.expectedLocationId)throw new InventoryError("BLOCKED","Состояние экземпляра изменилось после snapshot.");
   m=await changeSerializedStatusWithClient(tx,t,{instanceId:e.productInstanceId,type:"LOSS",reason:why,idempotencyKey:`stocktake:${id}:missing:${e.id}`},a);
  }
  return tx.stocktakeExpectedItem.update({where:{id:e.id},data:{resolution:action,resolutionReason:why,movementId:m?.id}});
 },{maxWait:10000,timeout:30000});
}
export async function resolveScan(t:TenantContext,id:string,scanId:string,action:"ACCEPT_LOCATION"|"ACCEPT_TRANSFER"|"FOUND"|"ACKNOWLEDGED",why:string,a:Actor){
 if(!["ACCEPT_LOCATION","ACCEPT_TRANSFER","FOUND","ACKNOWLEDGED"].includes(action)||!why.trim())throw new InventoryError("INVALID","Укажите решение и причину.");
 return db.$transaction(async tx=>{
  await member(tx,t.organizationId,a.userId);await lockResolution(tx,t.organizationId,id,scanId);
  const initial=await tx.stocktakeScan.findFirst({where:{id:scanId,organizationId:t.organizationId,sessionId:id},include:{productInstance:true}});
  if(!initial)throw new InventoryError("NOT_FOUND","Расхождение не найдено.");
  await lockInstance(tx,t.organizationId,initial.productInstance);
  const row=await tx.stocktakeScan.findFirst({where:{id:scanId,organizationId:t.organizationId,sessionId:id},include:{session:true,productInstance:true}});
  if(!row)throw new InventoryError("NOT_FOUND","Расхождение не найдено.");
  if(row.resolution){if(row.resolution!==action||row.resolutionReason!==why)throw new InventoryError("INVALID","Расхождение уже решено с другими данными.");return row;}
  if(row.session.status!=="COUNTED")throw new InventoryError("NOT_FOUND","Расхождение не найдено.");
  if(row.productInstance.version!==row.observedVersion)throw new InventoryError("BLOCKED","Состояние экземпляра изменилось после сканирования.");
  let m=null;
  if(action==="FOUND")m=await changeSerializedStatusWithClient(tx,t,{instanceId:row.productInstanceId,type:"FOUND",reason:why,idempotencyKey:`stocktake:${id}:scan:${row.id}`},a);
  else if(action==="ACCEPT_LOCATION"||action==="ACCEPT_TRANSFER")m=await transferSerializedWithClient(tx,t,{instanceId:row.productInstanceId,fromBranchId:row.productInstance.currentBranchId,toBranchId:row.session.branchId,toLocationId:row.session.locationId,reason:why,idempotencyKey:`stocktake:${id}:scan:${row.id}`},a);
  return tx.stocktakeScan.update({where:{id:row.id},data:{resolution:action,resolutionReason:why,movementId:m?.id}});
 },{maxWait:10000,timeout:30000});
}
export async function resolveBulk(t:TenantContext,id:string,bulkId:string,apply:boolean,why:string,a:Actor){
 if(!why.trim())throw new InventoryError("INVALID","Укажите причину решения.");
 return db.$transaction(async tx=>{
  await member(tx,t.organizationId,a.userId);await lockResolution(tx,t.organizationId,id,bulkId);
  const initial=await tx.stocktakeBulkCount.findFirst({where:{id:bulkId,organizationId:t.organizationId,sessionId:id},include:{session:true}});
  if(!initial)throw new InventoryError("NOT_FOUND","BULK расхождение не найдено.");
  await lockCapacityResource(tx,t.organizationId,initial.session.branchId,initial.productVariantId);
  const b=await tx.stocktakeBulkCount.findFirst({where:{id:bulkId,organizationId:t.organizationId,sessionId:id},include:{session:true}});
  if(!b)throw new InventoryError("NOT_FOUND","BULK расхождение не найдено.");
  const resolution=apply?"APPLY_ADJUSTMENT":"ACKNOWLEDGED";
  if(b.resolution){if(b.resolution!==resolution||b.resolutionReason!==why)throw new InventoryError("INVALID","Расхождение уже решено с другими данными.");return b;}
  if(b.session.status!=="COUNTED"||b.countedQuantity==null)throw new InventoryError("NOT_FOUND","BULK расхождение не найдено.");
  const current=await tx.stockLevel.findFirst({where:{organizationId:t.organizationId,branchId:b.session.branchId,locationId:b.session.locationId,productVariantId:b.productVariantId}});
  if((current?.updatedAt?.getTime()??null)!==(b.expectedUpdatedAt?.getTime()??null)||(current?.quantity??0)!==b.expectedQuantity)throw new InventoryError("BLOCKED","Остаток изменился после snapshot.");
  const delta=b.countedQuantity-b.expectedQuantity;
  const m=apply&&delta?await changeBulkWithClient(tx,t,{variantId:b.productVariantId,branchId:b.session.branchId,locationId:b.session.locationId,delta,type:"ADJUSTMENT",reason:why,idempotencyKey:`stocktake:${id}:bulk:${b.id}`},a):null;
  return tx.stocktakeBulkCount.update({where:{id:b.id},data:{resolution,resolutionReason:why,movementId:m?.id}});
 },{maxWait:10000,timeout:30000});
}
export async function reconcileStocktake(t:TenantContext,id:string,a:Actor){const s=await db.stocktakeSession.findFirst({where:{id,organizationId:t.organizationId},include:{expectedItems:true,scans:true,bulkCounts:true}});if(!s)throw new InventoryError("NOT_FOUND","Инвентаризация не найдена.");if(s.status==="RECONCILED")return s;if(s.status!=="COUNTED")throw new InventoryError("INVALID","Сначала завершите подсчёт.");const scanned=new Set(s.scans.map(x=>x.productInstanceId));if(s.expectedItems.some(x=>!scanned.has(x.productInstanceId)&&!x.resolution)||s.scans.some(x=>x.classification!=="MATCHED"&&!x.resolution)||s.bulkCounts.some(x=>x.countedQuantity!==null&&x.countedQuantity!==x.expectedQuantity&&!x.resolution))throw new InventoryError("INVALID","Каждое расхождение требует явного решения.");return db.stocktakeSession.update({where:{id},data:{status:"RECONCILED",reconciledAt:new Date(),reconciledByUserId:a.userId}})}
