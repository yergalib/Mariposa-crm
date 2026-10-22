import 'server-only';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {publicBookingInquiryInput} from '@/lib/showroom/contracts';
import {outfitContextSchema} from '../chat/outfit-contracts';
import {assertCheckpointPrivacy} from '../chat/recorded-turn';
import {variantOperationWhere} from '@/lib/catalog/operation-policy';
import {rentalPeriod} from '@/lib/showroom/period';
import {handoffPreferences} from '../chat/handoff';
import type {TelegramHandoffPorts} from './handoff';
export const telegramInquiryDraft=z.object({contact:publicBookingInquiryInput.shape.replyContact,context:outfitContextSchema}).strict();
export const validateTelegramInquiry:TelegramHandoffPorts['validate']=async(tx,scope,raw)=>{
  const draft=telegramInquiryDraft.parse(raw);assertCheckpointPrivacy(draft.context);
  const branch=await tx.branch.findFirst({where:{id:scope.branchId,organizationId:scope.organizationId,isPublic:true,status:'ACTIVE',organization:{status:'ACTIVE'}},select:{timezone:true}});
  if(!branch)throw new Error('Telegram inquiry branch unavailable');
  const context=draft.context;
  if(Boolean(context.from)!==Boolean(context.until))throw new Error('Complete period or no period required');
  const period=context.from&&context.until?rentalPeriod(context.from,context.until,branch.timezone):null;
  const ids=[...new Set(Object.values(context.selected).filter((v):v is string=>Boolean(v)))];
  if(ids.length>3)throw new Error('Too many inquiry items');
  const selected=await tx.productVariant.findMany({where:{AND:[variantOperationWhere(scope.organizationId,'RENTAL',true),{id:{in:ids}}]},
    select:{id:true,sku:true,product:{select:{name:true}},execution:{select:{name:true}},size:{select:{name:true,code:true}}}});
  if(selected.length!==ids.length)throw new Error('Telegram inquiry item no longer public');
  // This is a request for staff, not a price quote or an availability promise.
  // No URL/client price, payment, stock reservation or order is accepted.
  const recent={organizationId:scope.organizationId,source:'TELEGRAM' as const,createdAt:{gte:new Date(Date.now()-3600000)}};
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`showroom:${scope.organizationId}`},0))`;
  if(await tx.inquiry.count({where:recent})>=30||await tx.inquiry.count({where:{...recent,replyContact:draft.contact}})>=3)throw new Error('Telegram inquiry quota');
  const text=handoffPreferences(context)+'\nЭто обращение, не подтверждённая бронь. Стоимость и наличие проверяет сотрудник при оформлении.';
  return {itemCount:selected.length,summary:[...selected.map(v=>`${v.product.name} · ${v.execution?.name??''} · ${v.size.name||v.size.code}`),text,`Контакт для ответа: ${draft.contact}`],
    data:{creationKey:randomUUID(),creationHash:createHash('sha256').update(JSON.stringify([scope.principal,draft])).digest('hex'),subject:'Подбор из Telegram — запрос сотруднику',replyContact:draft.contact,requestText:text,requestedFrom:period?.from??null,requestedUntil:period?.until??null,
      requestedSize:selected.map(v=>v.size.name||v.size.code).join(' / ').slice(0,100)||null,
      items:{create:selected.map(v=>({organizationId:scope.organizationId,productVariantId:v.id,nameSnapshot:v.product.name+(v.execution?' · '+v.execution.name:''),skuSnapshot:v.sku,sizeSnapshot:v.size.name||v.size.code}))}}};
};
