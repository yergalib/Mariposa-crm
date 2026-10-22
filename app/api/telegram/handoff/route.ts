import {telegramConfig} from '@/lib/assistant/telegram/config';
import {z} from 'zod';
import type {Prisma} from '@/generated/prisma/client';
export const runtime='nodejs';
export async function POST(request:Request){
  const config=telegramConfig();if(!config)return new Response(null,{status:404});
  try{
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('Origin');
    const {requireOwnerDaySession}=await import('@/lib/assistant/owner-day-access');await requireOwnerDaySession(['LEAD_VIEW','LEAD_CREATE']);
    const {boundedJson}=await import('@/lib/showroom/http');
    const input=z.object({action:z.enum(['prepare','confirm']),update:z.unknown(),draft:z.unknown(),draftHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),confirmed:z.literal(true).optional()}).strict().parse(await boundedJson(request,16000));
    const {loadTelegramBinding,telegramEnvelope}=await import('@/lib/assistant/telegram/runtime');
    const event=telegramEnvelope.parse(input.update),binding=await loadTelegramBinding(event,config.botId);
    const {telegramScope}=await import('@/lib/assistant/telegram/adapter');const {scope}=telegramScope(binding,event);
    const {telegramStore}=await import('@/lib/assistant/telegram/store');const {authorizeTelegramOwner}=await import('@/lib/assistant/telegram/owner');
    const authorize=(s:typeof scope,tx?:Prisma.TransactionClient)=>authorizeTelegramOwner(s,true,tx),store=telegramStore(authorize);
    const {validateTelegramInquiry}=await import('@/lib/assistant/telegram/inquiry-draft');
    const ports={...store,authorize,validate:validateTelegramInquiry};
    const {prepareTelegramHandoff,telegramHandoff}=await import('@/lib/assistant/telegram/handoff');
    const result=input.action==='prepare'?await prepareTelegramHandoff(scope,String(event.update_id),input.draft,ports):await telegramHandoff(scope,{updateKey:String(event.update_id),draftHash:input.draftHash??'',draft:input.draft,confirmed:input.confirmed===true},ports);
    return Response.json(result,{headers:{'cache-control':'no-store'}});
  }catch{return Response.json({status:'unconfirmed'},{status:409,headers:{'cache-control':'no-store'}});}
}
