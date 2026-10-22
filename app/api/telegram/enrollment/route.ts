import {telegramConfig} from '@/lib/assistant/telegram/config';
import {z} from 'zod';
export const runtime='nodejs';
export async function POST(request:Request){
  const config=telegramConfig();if(!config)return new Response(null,{status:404});
  try{
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('Origin');
    const {boundedJson}=await import('@/lib/showroom/http');
    const input=z.discriminatedUnion('action',[
      z.object({action:z.literal('start'),branchId:z.string().uuid()}).strict(),
      z.object({action:z.enum(['inspect','confirm']),enrollmentId:z.string().uuid(),consent:z.literal(true).optional()}).strict(),
    ]).parse(await boundedJson(request,2000));
    const {startTelegramEnrollment,inspectTelegramEnrollment}=await import('@/lib/assistant/telegram/enrollment');
    if(input.action==='start')return Response.json(await startTelegramEnrollment(config.botId,input.branchId),{headers:{'cache-control':'no-store'}});
    if(input.action==='confirm'&&!input.consent)throw new Error('OpenAI and history consent required');
    return Response.json(await inspectTelegramEnrollment(input.enrollmentId,config.botId,input.action==='confirm'),{headers:{'cache-control':'no-store'}});
  }catch{return Response.json({status:'unavailable'},{status:409,headers:{'cache-control':'no-store'}});}
}
