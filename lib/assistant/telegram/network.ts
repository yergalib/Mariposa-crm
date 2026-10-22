import {customerNotices} from './customer-notices';
import 'server-only';
import {z} from 'zod';
import type {TelegramScope} from './adapter';
import type {TelegramKeyboard} from './checkout-buttons';
type Fetch=typeof fetch;
const tokenSchema=z.string().regex(/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/);
// Caller explicitly supplies the approved secret; this module reads no env,
// never logs URLs/bodies, follows no redirects and performs no automatic retry.
export function telegramNetwork(token:string,transport:Fetch=fetch){
  if(!tokenSchema.safeParse(token).success)throw new Error('Telegram credential format invalid');
  const botId=Number(token.split(':')[0]);
  async function call(method:'getMe'|'getWebhookInfo'|'sendMessage'|'answerCallbackQuery',body:unknown){
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
    async callbackReceipt(id:string,text:string){
      if(!/^[A-Za-z0-9_-]{1,160}$/.test(id)||text.length>180)throw Error('Callback receipt denied');
      await call('answerCallbackQuery',{callback_query_id:id,text,show_alert:false});
    },
    async media(scope:TelegramScope,photos:Blob[],caption:string){
      if(botId!==scope.botId||!scope.enabled||!scope.consent||scope.chatId!==scope.userId||Date.now()<scope.start||Date.now()>=scope.until||photos.length<1||photos.length>3||caption.length>1024||photos.some(p=>p.size>8*1024*1024))throw Error('Telegram media denied');
      const form=new FormData();form.set('chat_id',String(scope.chatId));form.set('protect_content','true');
      if(photos.length===1){form.set('photo',photos[0],'catalog.webp');form.set('caption',caption);}
      else {form.set('media',JSON.stringify(photos.map((_,i)=>({type:'photo',media:`attach://photo${i}`,...(i===0?{caption}:{})}))));photos.forEach((p,i)=>form.set(`photo${i}`,p,`catalog${i}.webp`));}
      try{
        const response=await transport(`https://api.telegram.org/bot${token}/${photos.length===1?'sendPhoto':'sendMediaGroup'}`,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
        if(!response.ok)throw Error('HTTP failure');const value=await response.json();if(value.ok!==true)throw Error('API failure');
        const messages=photos.length===1?[value.result]:value.result;
        const receipts=z.array(z.object({message_id:z.number().int().positive(),chat:z.object({id:z.number().int(),type:z.literal('private')})})).length(photos.length).parse(messages);
        if(receipts.some(r=>r.chat.id!==scope.chatId))throw Error('Receipt denied');return {messageId:receipts[0].message_id};
      }catch{throw Error('Telegram media unconfirmed');}
    },
    async notice(userId:number,kind:keyof typeof customerNotices){
      if(!Number.isSafeInteger(userId)||userId<=0||!Object.hasOwn(customerNotices,kind))throw Error('Private notice denied');
      const consent='Я ИИ-менеджер MARIPOSA. Сообщения подбора передаются OpenAI и сохраняются в истории чата. Согласие: /agree; остановить ответы: /stop. Контакт вводится отдельно при оформлении, хранится в защищённом черновике и не передаётся модели. Обращение в CRM создадим только после отдельного подтверждения. Заявка не означает бронь или оплату.';
      const ready='Расскажите, какой наряд нужен ребёнку, на какую дату и срок. Можно написать всё одним сообщением. Под вариантами будут кнопки выбора и помощи сотрудника; перед созданием обращения покажем его состав для подтверждения.';
      const text=kind==='consent'?consent:kind==='ready'?ready:customerNotices[kind];
      const result=z.object({message_id:z.number().int().positive(),chat:z.object({id:z.number().int(),type:z.literal('private')})}).parse(await call('sendMessage',{chat_id:userId,text,protect_content:true,link_preview_options:{is_disabled:true}}));
      if(result.chat.id!==userId)throw Error('Notice receipt unconfirmed');return {messageId:result.message_id};
    },
    // Read-only methods for AFTER credential authorization. Nothing calls them now.
    async identity(){return z.object({id:z.number().int().positive(),is_bot:z.literal(true),username:z.string()}).parse(await call('getMe',{}));},
    async webhookStatus(){
      const value=z.object({url:z.string(),pending_update_count:z.number().int().nonnegative()}).parse(await call('getWebhookInfo',{}));
      // Never return the URL, which can contain a credential or private endpoint.
      return {configured:Boolean(value.url),pendingUpdates:value.pending_update_count};
    },
    async send(scope:TelegramScope,text:string,keyboard?:TelegramKeyboard){
      if(botId!==scope.botId||!scope.enabled||!scope.consent||scope.chatId!==scope.userId||Date.now()<scope.start||Date.now()>=scope.until
        ||!text.trim()||text.length>4096)throw new Error('Telegram delivery denied');
      if(keyboard)z.object({inline_keyboard:z.array(z.array(z.object({text:z.string().min(1).max(64),callback_data:z.string().min(1).refine(v=>Buffer.byteLength(v,'utf8')<=64)}).strict()).min(1).max(2)).min(1).max(10)}).strict().parse(keyboard);
      const result=z.object({message_id:z.number().int().positive(),chat:z.object({id:z.number().int(),type:z.literal('private')})})
        .parse(await call('sendMessage',{chat_id:scope.chatId,text,protect_content:true,link_preview_options:{is_disabled:true},...(keyboard?{reply_markup:keyboard}:{})}));
      if(result.chat.id!==scope.chatId)throw new Error('Telegram delivery unconfirmed');
      return {messageId:result.message_id};
    },
  };
}
