import 'server-only';
import {z} from 'zod';
import type {TelegramScope} from './adapter';
type Fetch=typeof fetch;
const tokenSchema=z.string().regex(/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/);
// Caller explicitly supplies the approved secret; this module reads no env,
// never logs URLs/bodies, follows no redirects and performs no automatic retry.
export function telegramNetwork(token:string,transport:Fetch=fetch){
  if(!tokenSchema.safeParse(token).success)throw new Error('Telegram credential format invalid');
  const botId=Number(token.split(':')[0]);
  async function call(method:'getMe'|'getWebhookInfo'|'sendMessage',body:unknown){
    try{
      const response=await transport(`https://api.telegram.org/bot${token}/${method}`,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
        redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!response.ok)throw new Error('HTTP failure');
      const value=await response.json();
      if(!value||value.ok!==true)throw new Error('API failure');
      return value.result as unknown;
    }catch{throw new Error('Telegram operation unconfirmed');}
  }
  return {
    // Read-only methods for AFTER credential authorization. Nothing calls them now.
    async identity(){return z.object({id:z.number().int().positive(),is_bot:z.literal(true),username:z.string()}).parse(await call('getMe',{}));},
    async webhookStatus(){
      const value=z.object({url:z.string(),pending_update_count:z.number().int().nonnegative()}).parse(await call('getWebhookInfo',{}));
      // Never return the URL, which can contain a credential or private endpoint.
      return {configured:Boolean(value.url),pendingUpdates:value.pending_update_count};
    },
    async send(scope:TelegramScope,text:string){
      if(botId!==scope.botId||!scope.enabled||!scope.consent||scope.chatId!==scope.userId||Date.now()<scope.start||Date.now()>=scope.until
        ||!text.trim()||text.length>4096)throw new Error('Telegram delivery denied');
      const result=z.object({message_id:z.number().int().positive(),chat:z.object({id:z.number().int(),type:z.literal('private')})})
        .parse(await call('sendMessage',{chat_id:scope.chatId,text,protect_content:true,link_preview_options:{is_disabled:true}}));
      if(result.chat.id!==scope.chatId)throw new Error('Telegram delivery unconfirmed');
      return {messageId:result.message_id};
    },
  };
}
