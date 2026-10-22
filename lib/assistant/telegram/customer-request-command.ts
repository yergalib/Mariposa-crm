import 'server-only';
import {z} from 'zod';
import {db} from '@/lib/db';
import {prepareChannelRequest,confirmChannelRequest} from '@/lib/inquiries/confirmed-channel-request';
import {telegramScope,type TelegramBinding} from './adapter';
import {customerRequestStore} from './customer-request-store';
import {authorizeCustomer} from './customer-access';
import {telegramNetwork} from './network';

// Explicit confirmation commands never pass contact details to the model.
// The model cannot invoke this handler, and arbitrary product IDs are not accepted.
export async function customerRequestCommand(binding:TelegramBinding,raw:unknown,token:string){
  const {scope,update}=telegramScope(binding,raw),text=update.message.text.trim();
  if(!/^\/(request|confirm|handoff)(?:\s|$)/.test(text))return false;
  if(process.env.MARIPOSA_TELEGRAM_REQUESTS!=='confirmed-v1')return true;
  await authorizeCustomer(scope);
  let id:string,message:string,stage:boolean;
  const store=customerRequestStore(scope,update.update_id);
  const confirm=/^\/confirm ([a-f0-9-]{36})$/i.exec(text);
  if(confirm){
    const result=await confirmChannelRequest(confirm[1],true,store);
    if(result.status==='changed')throw Error('REQUEST_CHANGED_RECONFIRM');
    id=confirm[1];stage=false;
    message=`Заявка ${result.inquiryId} сохранена в MARIPOSA. Это не подтверждённая бронь; резерв и оплата не созданы.`;
  }else{
    const handoff=/^\/handoff (.{3,160})$/u.exec(text);
    if(handoff){
      const draft=await prepareChannelRequest({purpose:'exception',contact:handoff[1],variantIds:[],from:null,until:null},store);
      id=draft.id;stage=true;
      message=[...draft.quote.summary,`Контакт: ${draft.draft.contact}`,`Для согласия передать обращение сотруднику отправьте /confirm ${id}`].join('\n');
    }else{
    const parsed=/^\/request ([1-9])\s+(.{3,160})$/u.exec(text);
    if(!parsed)throw Error('REQUEST_CONTACT_REQUIRED');
    const latest=await db.$queryRaw<{offered:unknown}[]>`SELECT t.offered FROM assistant_telegram_customer_turns t JOIN assistant_telegram_customers c ON c.id=t.binding_id WHERE c.organization_id=${scope.organizationId}::uuid AND c.bot_id=${scope.botId} AND c.chat_id=${scope.chatId} AND c.generation=${scope.generation}::uuid AND t.kind='dialogue' AND t.state='complete' AND t.history_input IS NOT NULL ORDER BY t.update_id DESC LIMIT 1`;
    const options=z.array(z.object({variantId:z.string().uuid(),productId:z.string().uuid(),executionId:z.string().uuid().nullable(),from:z.string(),until:z.string()})).parse(latest[0]?.offered??[]);
    const option=options[Number(parsed[1])-1];if(!option)throw Error('REQUEST_SELECTION_REQUIRED');
    const draft=await prepareChannelRequest({contact:parsed[2],variantIds:[option.variantId],from:option.from,until:option.until},store);
    id=draft.id;stage=true;
    message=[...draft.quote.summary,`Контакт для ответа: ${draft.draft.contact}`,`Проверьте заявку. Для согласия сохранить её и контакт в CRM отправьте /confirm ${id}`].join('\n');
    }
  }
  // Same principal lock as inquiry creation. Delivery uncertainty is durable and
  // never resent automatically, even if Telegram retries the webhook.
  const changed=await db.$transaction(async tx=>{
    await authorizeCustomer(scope,tx);
    return stage?tx.$executeRaw`UPDATE assistant_telegram_customer_requests r SET stage_delivery='sending' FROM assistant_telegram_customers c WHERE r.id=${id}::uuid AND r.binding_id=c.id AND c.organization_id=${scope.organizationId}::uuid AND c.chat_id=${scope.chatId} AND c.bot_id=${scope.botId} AND c.generation=${scope.generation}::uuid AND r.stage_delivery='unsent'`
      :tx.$executeRaw`UPDATE assistant_telegram_customer_requests r SET confirm_delivery='sending' FROM assistant_telegram_customers c WHERE r.id=${id}::uuid AND r.binding_id=c.id AND c.organization_id=${scope.organizationId}::uuid AND c.chat_id=${scope.chatId} AND c.bot_id=${scope.botId} AND c.generation=${scope.generation}::uuid AND r.inquiry_id IS NOT NULL AND r.confirm_delivery='unsent'`;
  });
  if(changed!==1)return true;
  try{
    await authorizeCustomer(scope);const receipt=await telegramNetwork(token).send(scope,message);
    if(stage)await db.$executeRaw`UPDATE assistant_telegram_customer_requests SET stage_delivery='sent',stage_message_id=${receipt.messageId} WHERE id=${id}::uuid AND stage_delivery='sending'`;
    else await db.$executeRaw`UPDATE assistant_telegram_customer_requests SET confirm_delivery='sent',confirm_message_id=${receipt.messageId} WHERE id=${id}::uuid AND confirm_delivery='sending'`;
  }catch{
    if(stage)await db.$executeRaw`UPDATE assistant_telegram_customer_requests SET stage_delivery='unknown' WHERE id=${id}::uuid AND stage_delivery='sending'`;
    else await db.$executeRaw`UPDATE assistant_telegram_customer_requests SET confirm_delivery='unknown' WHERE id=${id}::uuid AND confirm_delivery='sending'`;
  }
  return true;
}
