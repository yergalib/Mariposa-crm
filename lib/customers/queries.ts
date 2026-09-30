import "server-only";
import {db} from "@/lib/db";
import {normalizeEmail,normalizePhone} from "@/lib/customers/normalization";
import type {TenantContext} from "@/lib/tenant/context";
export async function getCustomers(tenant:TenantContext,input:{search?:string;status?:"ACTIVE"|"BLOCKED"|"ARCHIVED";source?:string}){const q=input.search?.trim().slice(0,100),phone=q?normalizePhone(q):"",email=q&&q.includes("@")?normalizeEmail(q):"";return db.customer.findMany({where:{organizationId:tenant.organizationId,status:input.status,source:input.source||undefined,...(q?{OR:[{firstName:{contains:q,mode:"insensitive"}},{lastName:{contains:q,mode:"insensitive"}},{middleName:{contains:q,mode:"insensitive"}},{customerNumber:{contains:q,mode:"insensitive"}},{contacts:{some:{OR:[...(phone?[{normalizedValue:phone}]:[]),...(email?[{normalizedValue:email}]:[]),{value:{contains:q,mode:"insensitive"}}]}}}]}:{})},orderBy:{createdAt:"desc"},take:200,include:{contacts:{orderBy:[{isPrimary:"desc"},{createdAt:"asc"}]}}});}
export async function getCustomer(tenant:TenantContext,id:string,allowedBranchIds?:string[]|null){return db.customer.findFirst({where:{id,organizationId:tenant.organizationId},include:{contacts:{orderBy:[{isPrimary:"desc"},{createdAt:"asc"}]},addresses:{orderBy:[{isPrimary:"desc"},{createdAt:"asc"}]},notes:{where:{archivedAt:null},orderBy:{createdAt:"desc"},include:{createdBy:{select:{displayName:true}}}},orders:{where:{branchId:allowedBranchIds?{in:allowedBranchIds}:undefined},orderBy:{createdAt:"desc"},take:10,select:{id:true,orderNumber:true,status:true,rentalStartAt:true,rentalEndAt:true,totalMinor:true,currency:true,branch:{select:{timezone:true}}}},createdBy:{select:{displayName:true}},_count:{select:{orders:{where:{branchId:allowedBranchIds?{in:allowedBranchIds}:undefined}}}}}});}
export async function getCustomerOrderHistory(tenant:TenantContext,id:string,allowedBranchIds:string[]|null,page:number){
  const customer=await db.customer.findFirst({where:{id,organizationId:tenant.organizationId},select:{id:true,firstName:true,lastName:true,customerNumber:true}});
  if(!customer)return null;
  const where={organizationId:tenant.organizationId,customerId:id,branchId:allowedBranchIds?{in:allowedBranchIds}:undefined};
  const total=await db.order.count({where});
  const pageCount=Math.max(1,Math.ceil(total/25)),currentPage=Math.min(Math.max(1,page),pageCount);
  const orders=await db.order.findMany({where,select:{id:true,orderNumber:true,type:true,status:true,rentalStartAt:true,rentalEndAt:true,totalMinor:true,currency:true,branch:{select:{name:true,timezone:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(currentPage-1)*25,take:25});
  return{customer,total,page:currentPage,pageCount,orders};
}
