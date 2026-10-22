import 'server-only';
import type {Prisma} from '@/generated/prisma/client';
import {variantOperationWhere} from '@/lib/catalog/operation-policy';
import {getVariantAvailabilityWithClient} from '@/lib/availability/capacity';
import {createTenantContext} from '@/lib/tenant/context';
import {rentalPeriod,rentalPeriodLabel,RENTAL_CONDITIONS} from '@/lib/showroom/period';
import {selectedRentalPrice} from '@/lib/showroom/prices';
import {formatCatalogMoney} from '@/lib/showroom/money';
import {publicBookingInquiryInput} from '@/lib/showroom/contracts';
import {quoteFingerprint,type ChannelRequest} from './confirmed-channel-request';

// Same publication, price selection, calendar and capacity rules as showroom.
// This read creates no allocation; only staff can subsequently reserve an item.
export async function channelRentalQuote(tx:Prisma.TransactionClient,scope:{organizationId:string;branchId:string},draft:ChannelRequest){
  if(!publicBookingInquiryInput.shape.replyContact.safeParse(draft.contact).success)throw Error('REQUEST_CONTACT_REQUIRED');
  const branch=await tx.branch.findFirst({where:{id:scope.branchId,organizationId:scope.organizationId,isPublic:true,status:'ACTIVE',organization:{status:'ACTIVE'}},select:{timezone:true,name:true}});
  if(!branch)throw Error('REQUEST_BRANCH_UNAVAILABLE');
  if(draft.purpose==='exception')return {items:[],period:null,summary:[branch.name,'Обращение сотруднику по исключению. Передадим контакт и последние сообщения подбора. Товар, цена, бронь и время выдачи не обещаны.'],fingerprint:quoteFingerprint({branch:scope.branchId,purpose:'exception'})};
  if(!draft.from||!draft.until)throw Error('REQUEST_PERIOD_REQUIRED');
  const period=rentalPeriod(draft.from,draft.until,branch.timezone),now=new Date();
  const rows=await tx.productVariant.findMany({where:{AND:[variantOperationWhere(scope.organizationId,'RENTAL',true),{id:{in:draft.variantIds}}]},
    select:{id:true,sku:true,product:{select:{name:true}},execution:{select:{name:true}},size:{select:{name:true,code:true}},prices:{where:{organizationId:scope.organizationId,type:'RENTAL',validFrom:{lte:now},AND:[{OR:[{validUntil:null},{validUntil:{gt:now}}]},{OR:[{branchId:scope.branchId},{branchId:null}]}]},orderBy:[{validFrom:'desc'},{id:'asc'}],select:{amountMinor:true,currency:true,branchId:true}}}});
  if(rows.length!==draft.variantIds.length)throw Error('REQUEST_ITEM_UNAVAILABLE');
  const items=[];
  for(const id of draft.variantIds){
    const row=rows.find(r=>r.id===id)!;
    const availability=await getVariantAvailabilityWithClient(tx,{tenant:createTenantContext(scope.organizationId),branchId:scope.branchId,productVariantId:id,requestedFrom:period.from,requestedUntil:period.until});
    const price=selectedRentalPrice(row.prices,scope.branchId);
    items.push({id,sku:row.sku,name:row.product.name,execution:row.execution?.name??null,size:row.size.name||row.size.code,price,available:availability.canFulfill});
  }
  const summary=[branch.name,rentalPeriodLabel(draft.from,draft.until),RENTAL_CONDITIONS,...items.map(i=>`${i.name}${i.execution?' — '+i.execution:''}, ${i.size}: ${i.price?formatCatalogMoney(i.price.amountMinor,i.price.currency)+' по каталогу':'цену уточнит сотрудник'}; ${i.available?'доступно на момент проверки':'на выбранный срок недоступно, нужна помощь сотрудника'}`),
    'Это обращение сотруднику, не подтверждённая бронь. Итоговую стоимость и возможность выдачи подтверждает сотрудник.'];
  return {items,period,summary,fingerprint:quoteFingerprint({branch:scope.branchId,from:period.from.toISOString(),until:period.until.toISOString(),items})};
}
