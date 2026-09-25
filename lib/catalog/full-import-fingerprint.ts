import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Reader=PrismaClient|Prisma.TransactionClient;
const canonical=(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==="bigint"?item.toString():item);

export async function getCatalogImportDatabaseFingerprint(db:Reader,organizationId:string,branchId:string,locationId:string){
  const organization=await db.organization.findUnique({where:{id:organizationId},select:{id:true,name:true,slug:true,status:true}});
  const branch=await db.branch.findUnique({where:{id:branchId},select:{id:true,organizationId:true,name:true,code:true,city:true,status:true}});
  const location=await db.location.findUnique({where:{id:locationId},select:{id:true,organizationId:true,branchId:true,name:true,code:true,type:true,isActive:true}});
  if(!organization||!branch||!location||branch.organizationId!==organizationId||location.organizationId!==organizationId||location.branchId!==branchId)throw new Error("Catalog import target identity mismatch");
  const products=await db.product.findMany({where:{organizationId},orderBy:{id:"asc"},select:{id:true,name:true,internalCode:true,trackingMode:true,publicationStatus:true,archivedAt:true}});
  const variants=await db.productVariant.findMany({where:{organizationId},orderBy:{id:"asc"},select:{id:true,productId:true,executionId:true,sizeId:true,sku:true,isActive:true}});
  const instances=await db.productInstance.findMany({where:{organizationId},orderBy:{id:"asc"},select:{id:true,productVariantId:true,barcode:true,operationalStatus:true,retiredAt:true}});
  const stocks=await db.stockLevel.findMany({where:{organizationId},orderBy:{id:"asc"},select:{id:true,productVariantId:true,branchId:true,locationId:true,quantity:true}});
  const state={organization,branch,location,products,variants,instances,stocks};
  return {sha256:createHash("sha256").update(canonical(state)).digest("hex").toUpperCase(),state};
}
