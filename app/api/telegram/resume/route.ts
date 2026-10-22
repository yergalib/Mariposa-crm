import {telegramConfig} from '@/lib/assistant/telegram/config';
import {z} from 'zod';
export const runtime='nodejs';
export const maxDuration=30;
export async function POST(request:Request){
  const config=telegramConfig();if(!config)return new Response(null,{status:404});
  try{
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('Origin');
    const {requireOwnerDaySession}=await import('@/lib/assistant/owner-day-access');await requireOwnerDaySession();
    const {boundedJson}=await import('@/lib/showroom/http');
    const input=z.object({checkpointId:z.string().uuid(),update:z.unknown()}).strict().parse(await boundedJson(request,12000));
    const {loadTelegramBinding,telegramRuntime}=await import('@/lib/assistant/telegram/runtime');
    const binding=await loadTelegramBinding(input.update,config.botId);
    const {resumeTelegramUpdate}=await import('@/lib/assistant/telegram/handler');
    return Response.json(await resumeTelegramUpdate(binding,input.update,input.checkpointId,telegramRuntime(config.token,AbortSignal.timeout(24000))),{headers:{'cache-control':'no-store'}});
  }catch{return Response.json({status:'unconfirmed'},{status:409,headers:{'cache-control':'no-store'}});}
}
