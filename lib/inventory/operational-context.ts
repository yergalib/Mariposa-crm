import "server-only";

import { db } from "@/lib/db";
import type { BulkOperationalActor } from "@/lib/fulfillment/bulk-authorization";
import { FulfillmentError } from "@/lib/fulfillment/errors";
import { lookupCurrentRentalByBarcode } from "@/lib/fulfillment/returns";
import type { OperationalContext, OperationalIdentifierResult, ScanPurpose } from "@/lib/inventory/operational-contract";
import { resolveOperationalIdentifier } from "@/lib/inventory/operational-identifier";
import { getOutstandingBulkRentalsForVariant } from "@/lib/inventory/scan";
import { accessibleBranchIds, requireBranchAccess } from "@/lib/staff/branch-access";
import type { TenantContext } from "@/lib/tenant/context";

export async function resolveOperationalContext(tenant:TenantContext,input:{rawIdentifier:string;purpose:ScanPurpose;stocktakeSessionId?:string},actor:BulkOperationalActor):Promise<{result:OperationalIdentifierResult;context:OperationalContext|null}>{
  const result=await resolveOperationalIdentifier(tenant,input,actor);
  if(input.purpose==="RETURN_RECEIVE"){
    if(result.kind==="BULK_VARIANT"){
      const rows=await getOutstandingBulkRentalsForVariant(tenant,result.variant.id,actor);
      return{result,context:{kind:"RETURN_BULK",eligible:rows.length>0,orders:rows.map(row=>({...row,rentalEndAt:row.rentalEndAt?.toISOString()??null}))}};
    }
    if(result.kind==="SERIALIZED_INSTANCE"){
      try{
        const rental=await lookupCurrentRentalByBarcode(tenant,result.instance.barcode);
        await requireBranchAccess(tenant,actor.membershipId,rental.order.branchId);
        return{result,context:{kind:"RETURN_SERIALIZED",eligible:true,order:{id:rental.order.id,orderNumber:rental.order.orderNumber,customerName:[rental.order.customer.firstName,rental.order.customer.lastName].filter(Boolean).join(" "),branchName:rental.order.branch.name,rentalEndAt:rental.order.rentalEndAt?.toISOString()??null},overdue:rental.overdue}};
      }catch(error){
        if(error instanceof FulfillmentError&&["NOT_FOUND","INVALID_STATE","DATA_INTEGRITY"].includes(error.code))return{result,context:{kind:"RETURN_NOT_ELIGIBLE",eligible:false,message:error.message}};
        throw error;
      }
    }
  }
  if(input.purpose==="WAREHOUSE_LOOKUP"){
    if(result.kind==="BULK_VARIANT"){
      const branchIds=await accessibleBranchIds(tenant,actor.membershipId);
      const levels=await db.stockLevel.findMany({where:{organizationId:tenant.organizationId,productVariantId:result.variant.id,branchId:branchIds?{in:branchIds}:undefined},select:{branchId:true,locationId:true,quantity:true,branch:{select:{name:true}},location:{select:{name:true}}},orderBy:[{branch:{name:"asc"}},{location:{name:"asc"}}]});
      return{result,context:{kind:"WAREHOUSE_BULK",levels:levels.map(level=>({branchId:level.branchId,branchName:level.branch.name,locationId:level.locationId,locationName:level.location?.name??"Без зоны",quantity:level.quantity}))}};
    }
    if(result.kind==="SERIALIZED_INSTANCE"){
      const location=await db.location.findFirst({where:{id:result.instance.locationId,organizationId:tenant.organizationId,branchId:result.instance.branchId},select:{name:true,branch:{select:{name:true}}}});
      if(!location)throw new FulfillmentError("NOT_FOUND","Местонахождение экземпляра недоступно.");
      return{result,context:{kind:"WAREHOUSE_SERIALIZED",branchName:location.branch.name,locationName:location.name,operationalStatus:result.instance.operationalStatus,conditionStatus:result.instance.conditionStatus}};
    }
  }
  if(input.purpose==="STOCKTAKE_COUNT"){
    if(!input.stocktakeSessionId)throw new FulfillmentError("INVALID_STATE","Инвентаризация не выбрана.");
    const session=await db.stocktakeSession.findFirst({where:{id:input.stocktakeSessionId,organizationId:tenant.organizationId,status:"IN_PROGRESS"},select:{id:true,branchId:true,locationId:true,location:{select:{name:true}}}});
    if(!session)throw new FulfillmentError("NOT_FOUND","Активная инвентаризация не найдена.");
    await requireBranchAccess(tenant,actor.membershipId,session.branchId);
    if(result.kind==="BULK_VARIANT"){
      const count=await db.stocktakeBulkCount.findUnique({where:{sessionId_productVariantId:{sessionId:session.id,productVariantId:result.variant.id}},select:{expectedQuantity:true,countedQuantity:true}});
      const expectedQuantity=count?.expectedQuantity??0,countedQuantity=count?.countedQuantity??null;
      return{result,context:{kind:"STOCKTAKE_BULK",sessionId:session.id,expectedQuantity,countedQuantity,difference:countedQuantity==null?null:countedQuantity-expectedQuantity,locationName:session.location.name}};
    }
    if(result.kind==="SERIALIZED_INSTANCE"){
      const observed=await db.stocktakeScan.findUnique({where:{sessionId_productInstanceId:{sessionId:session.id,productInstanceId:result.instance.id}},select:{classification:true}});
      const expected=await db.stocktakeExpectedItem.findUnique({where:{sessionId_productInstanceId:{sessionId:session.id,productInstanceId:result.instance.id}},select:{id:true}});
      const classification=observed?.classification??(expected?"MATCHED":result.instance.branchId!==session.branchId?"WRONG_BRANCH":result.instance.locationId!==session.locationId?"WRONG_LOCATION":"UNEXPECTED");
      return{result,context:{kind:"STOCKTAKE_SERIALIZED",sessionId:session.id,alreadyObserved:!!observed,classification,locationName:session.location.name}};
    }
  }
  return{result,context:null};
}
