import {telegramIngressDecision} from '@/lib/assistant/telegram/ingress';
import {telegramConfig} from '@/lib/assistant/telegram/config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function POST(request:Request){
  const deadline=Date.now()+24000;
  if(telegramIngressDecision(request)!=='webhook')return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
  const config=telegramConfig();
  if(!config)return new Response(null,{status:404});
  try{
    const {authenticateWebhook}=await import('@/lib/assistant/telegram/webhook-auth');
    authenticateWebhook(config.secret,request.headers.get('x-telegram-bot-api-secret-token'));
    const {boundedJson,pressureLimit}=await import('@/lib/showroom/http');
    pressureLimit('read');const raw=await boundedJson(request,12000);
    if(!raw||typeof raw!=='object'||(!('message' in raw)&&!('callback_query' in raw)))return new Response(null,{status:200});
    if(process.env.MARIPOSA_TELEGRAM_MODE==='customer-test-v1'){
      const {handleCustomerCallback,customerContactMessage,invalidateCustomerCheckout}=await import('@/lib/assistant/telegram/customer-checkout');
      if(await handleCustomerCallback(raw,config.botId,config.token))return new Response(null,{status:200});
      const {telegramEnvelope}=await import('@/lib/assistant/telegram/runtime');
      if(!telegramEnvelope.safeParse(raw).success)return new Response(null,{status:200});
      const {customerEnvelope}=await import('@/lib/assistant/telegram/customer-enrollment');
      const accepted=await customerEnvelope(raw,config.botId,config.token);
      if(!accepted)return new Response(null,{status:200});
      const {customerRequestCommand}=await import('@/lib/assistant/telegram/customer-request-command');
      try{if(await customerContactMessage(accepted.binding,accepted.event,config.token)||await customerRequestCommand(accepted.binding,accepted.event,config.token))return new Response(null,{status:200});}
      catch(error){
        const name=error instanceof Error?error.message:'';
        const notice=['REQUEST_CONTACT_REQUIRED','REQUEST_SELECTION_REQUIRED'].includes(name)?'requestInput'
          :['REQUEST_CHANGED_RECONFIRM','REQUEST_CHANGED','REQUEST_EXPIRED','REQUEST_ITEM_UNAVAILABLE','REQUEST_NOT_FOUND','REQUEST_SELECTION_STALE'].includes(name)?'requestChanged'
          :name==='REQUEST_RATE_LIMIT'?'requestLimited':null;
        if(!notice)throw error;
        await customerEnvelope(raw,config.botId,config.token,notice);return new Response(null,{status:200});
      }
      await invalidateCustomerCheckout(accepted.binding,accepted.event);
      const {hasSensitiveText}=await import('@/lib/assistant/chat/contracts');
      if(hasSensitiveText(accepted.event.message.text)){
        await customerEnvelope(raw,config.botId,config.token,'requestInput');return new Response(null,{status:200});
      }
      const {customerRuntime}=await import('@/lib/assistant/telegram/customer-runtime');
      const {handleTelegramUpdate}=await import('@/lib/assistant/telegram/handler');
      let result;
      try{result=await handleTelegramUpdate({enabled:true,webhookSecret:config.secret,deadline},config.secret,accepted.binding,accepted.event,customerRuntime(config.token,accepted.event.update_id,AbortSignal.timeout(Math.max(1,deadline-Date.now())),deadline));}
      catch(error){
        const {customerFailureNotice}=await import('@/lib/assistant/telegram/customer-notices');const notice=customerFailureNotice(error);
        if(notice){
          await customerEnvelope(raw,config.botId,config.token,notice);return new Response(null,{status:200});
        }
        await customerEnvelope(raw,config.botId,config.token,'failed');
        throw error;
      }
      if(result.outcome==='blocked'||result.outcome==='expired')await customerEnvelope(raw,config.botId,config.token,'failed');
      return Response.json({status:result.outcome},{status:result.status,headers:{'cache-control':'no-store'}});
    }
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
    const result=await handleTelegramUpdate({enabled:true,webhookSecret:config.secret,deadline},config.secret,binding,parsed.data,telegramRuntime(config.token,AbortSignal.timeout(Math.max(1,deadline-Date.now()))));
    return Response.json({status:result.outcome},{status:result.status,headers:{'cache-control':'no-store'}});
  }catch{return Response.json({status:'unconfirmed'},{status:503,headers:{'cache-control':'no-store'}});}
}
