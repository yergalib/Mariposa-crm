import 'server-only';
import {db} from '@/lib/db';
import {quoteFingerprint} from '@/lib/inquiries/confirmed-channel-request';
import type {ChatReply} from '../chat/contracts';
import type {TelegramScope} from './adapter';
import {authorizeCustomer} from './customer-access';
import {telegramNetwork} from './network';

// Photos are read through existing execution-specific public policy. Never fetch
// a model-supplied URL or expose a protected storage URL to Telegram.
export async function customerReplyDelivery(token:string,scope:TelegramScope,reply:ChatReply,text:string,updateId:number){
 await authorizeCustomer(scope);
 if(process.env.MARIPOSA_TELEGRAM_REQUESTS!=='confirmed-v1')return telegramNetwork(token).send(scope,text);
 const {publicPhotos,readPublicPhoto}=await import('@/lib/showroom/photos');
 const help=reply.cards.length?'\nДля заявки: /request номер_варианта телефон_или_email. Контакт сохранится в защищённом черновике, не у ИИ. Затем проверьте состав и подтвердите создание обращения.':'';
 const labelled=reply.cards.map((c,i)=>`${i+1}. ${c.item.name}, ${c.item.size}`).join('\n');
 const full=[text,labelled,help].filter(Boolean).join('\n');
 if(full.length>4096)throw Error('Telegram reply too large');
 const photos:Blob[]=[],names:string[]=[],photoIds:string[]=[];
 for(const card of reply.cards.slice(0,3)){
   const list=await publicPhotos(scope.organizationId,{productId:card.productId,executionId:card.executionId,name:card.item.name});
   if(!list[0])continue;
   const blob=await readPublicPhoto(scope.organizationId,{productId:card.productId,executionId:card.executionId,imageId:list[0].id,rendition:'catalog'});
   if(blob){photos.push(blob);names.push(`${card.item.name}, ${card.item.execution??''}, ${card.item.size}`);photoIds.push(list[0].id);}
 }
 await authorizeCustomer(scope);
 const rows=await db.$queryRaw<{id:string}[]>`SELECT t.id FROM assistant_telegram_customer_turns t JOIN assistant_telegram_customers c ON c.id=t.binding_id WHERE c.organization_id=${scope.organizationId}::uuid AND c.bot_id=${scope.botId} AND c.chat_id=${scope.chatId} AND c.generation=${scope.generation}::uuid AND t.update_id=${updateId} AND t.kind='dialogue' AND t.state='complete' AND t.delivery_state='sending'`;
 if(rows.length!==1)throw Error('Telegram delivery context denied');
 const turn=rows[0].id,network=telegramNetwork(token);
 async function part(index:number,hash:string,send:()=>Promise<{messageId:number}>){
   await authorizeCustomer(scope);
   const n=await db.$executeRaw`INSERT INTO assistant_telegram_customer_delivery_parts(turn_id,part,content_hash,state) VALUES(${turn}::uuid,${index},${hash},'sending') ON CONFLICT DO NOTHING`;
   if(n!==1)throw Error('Telegram delivery part already claimed');
   try{const receipt=await send();const updated=await db.$executeRaw`UPDATE assistant_telegram_customer_delivery_parts SET state='sent',telegram_message_id=${receipt.messageId} WHERE turn_id=${turn}::uuid AND part=${index} AND state='sending'`;if(updated!==1)throw Error('Receipt unconfirmed');return receipt;}
   catch{await db.$executeRaw`UPDATE assistant_telegram_customer_delivery_parts SET state='unknown' WHERE turn_id=${turn}::uuid AND part=${index} AND state='sending'`;throw Error('Telegram delivery part unconfirmed');}
 }
 const caption=names.join('\n');if(caption.length>1024)throw Error('Telegram media caption too large');
 const receipt=await part(0,quoteFingerprint(full),()=>network.send(scope,full));
 if(photos.length)await part(1,quoteFingerprint(photoIds),()=>network.media(scope,photos,caption));
 return receipt;
}
