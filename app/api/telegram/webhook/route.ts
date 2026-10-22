import {telegramIngressDecision} from '@/lib/assistant/telegram/ingress';
import {telegramConfig} from '@/lib/assistant/telegram/config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function POST(request:Request){
  if(telegramIngressDecision(request)!=='webhook')return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
  const config=telegramConfig();
  if(!config)return new Response(null,{status:404});
  try{
    const {authenticateWebhook}=await import('@/lib/assistant/telegram/adapter');
    authenticateWebhook(config.secret,request.headers.get('x-telegram-bot-api-secret-token'));
    const {boundedJson,pressureLimit}=await import('@/lib/showroom/http');
    pressureLimit('read');const raw=await boundedJson(request,12000);
    const {telegramEnvelope,loadTelegramBinding,telegramRuntime}=await import('@/lib/assistant/telegram/runtime');
    const parsed=telegramEnvelope.safeParse(raw);
    if(!parsed.success)return new Response(null,{status:200}); // Unsupported updates never reach model.
    const {redeemTelegramEnrollment}=await import('@/lib/assistant/telegram/enrollment');
    if(parsed.data.message.text.startsWith('/start ')){
      await redeemTelegramEnrollment(parsed.data,config.botId);return new Response(null,{status:200});
    }
    let binding;
    try{binding=await loadTelegramBinding(parsed.data,config.botId);}catch{return new Response(null,{status:200});}
    const {handleTelegramUpdate}=await import('@/lib/assistant/telegram/handler');
    const result=await handleTelegramUpdate({enabled:true,webhookSecret:config.secret},config.secret,binding,parsed.data,telegramRuntime(config.token,AbortSignal.timeout(24000)));
    return Response.json({status:result.outcome},{status:result.status,headers:{'cache-control':'no-store'}});
  }catch{return Response.json({status:'unconfirmed'},{status:503,headers:{'cache-control':'no-store'}});}
}
