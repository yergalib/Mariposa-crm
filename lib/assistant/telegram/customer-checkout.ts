import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db} from '@/lib/db';
import type {Prisma} from '@/generated/prisma/client';
import {publicBookingInquiryInput} from '@/lib/showroom/contracts';
import {customerConfig} from './customer-config';
import {authorizeCustomer} from './customer-access';
import {telegramScope,type TelegramBinding,type TelegramScope} from './adapter';
import {telegramNetwork} from './network';
import {customerRequestCommand} from './customer-request-command';
import {cancelSelectionButton} from './checkout-buttons';

const positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const callbackEnvelope=z.object({update_id:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),callback_query:z.object({
 id:z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),from:z.object({id:positive,is_bot:z.literal(false)}),
 data:z.string().max(64),message:z.object({message_id:positive,from:z.object({id:positive,is_bot:z.literal(true)}),chat:z.object({id:positive,type:z.literal('private')})})})});
type Flow={version:string;source_turn:string;source_stale:boolean;choice:number;last_update_id:bigint;request_id:string|null;contact_update_id:bigint|null;expires_at:Date};
const actionSchema=z.string().regex(/^(s:[a-f0-9-]{36}:(?:-1|[0-8])|[crx]:[a-f0-9-]{36})$/i).refine(v=>z.string().uuid().safeParse(v.split(':')[1]).success);
async function locked<T>(scope:TelegramScope,operation:(tx:Prisma.TransactionClient,binding:string)=>Promise<T>){
 return db.$transaction(async tx=>{
   const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM assistant_telegram_customers WHERE organization_id=${scope.organizationId}::uuid AND bot_id=${scope.botId} AND chat_id=${scope.chatId} AND sender_id=${scope.userId} AND generation=${scope.generation}::uuid FOR UPDATE`;
   if(rows.length!==1)throw Error('CHECKOUT_DENIED');await authorizeCustomer(scope,tx);
   return operation(tx,rows[0].id);
 });
}
async function latest(tx:Prisma.TransactionClient,binding:string){
 const rows=await tx.$queryRaw<{id:string;offered:unknown[];state:string;expires_at:Date;update_id:bigint}[]>`SELECT id,offered,state,expires_at,update_id FROM assistant_telegram_customer_turns WHERE binding_id=${binding}::uuid AND kind='dialogue' ORDER BY update_id DESC LIMIT 1`;
 return rows[0];
}
async function clear(tx:Prisma.TransactionClient,binding:string){
 await tx.$executeRaw`UPDATE assistant_telegram_customer_requests SET invalidated=true WHERE binding_id=${binding}::uuid AND inquiry_id IS NULL`;
 await tx.$executeRaw`UPDATE assistant_telegram_customer_checkout SET expires_at=clock_timestamp() WHERE binding_id=${binding}::uuid`;
}

export async function handleCustomerCallback(raw:unknown,botId:number,token:string){
 if(!raw||typeof raw!=='object'||!('callback_query' in raw))return false;
 const parsed=callbackEnvelope.safeParse(raw),cfg=customerConfig();
 if(!parsed.success||!cfg)return true;
 const event=parsed.data,c=event.callback_query;
 if(c.from.id!==c.message.chat.id||c.message.from.id!==botId||!actionSchema.safeParse(c.data).success)return true;
 const rows=await db.$queryRaw<{generation:string;starts_at:Date;expires_at:Date}[]>`SELECT generation,starts_at,expires_at FROM assistant_telegram_customers WHERE organization_id=${cfg.organizationId}::uuid AND bot_id=${botId} AND sender_id=${c.from.id} AND chat_id=${c.message.chat.id} AND enabled=true AND consent_version=${cfg.consentVersion} AND expires_at>clock_timestamp()`;
 if(rows.length!==1)return true;
 const binding:TelegramBinding={enabled:true,consent:true,organizationId:cfg.organizationId,membershipId:cfg.membershipId,branchId:cfg.branchId,botId,userId:c.from.id,chatId:c.message.chat.id,generation:rows[0].generation,start:rows[0].starts_at.getTime(),until:rows[0].expires_at.getTime()};
 const message={update_id:event.update_id,message:{message_id:c.message.message_id,date:Math.floor(Date.now()/1000),from:c.from,chat:c.message.chat,text:'button'}};
 const {scope}=telegramScope(binding,message),network=telegramNetwork(token);
 let acknowledgment='Выбор принят';
 try{
   const [action,id,index]=c.data.split(':');z.string().uuid().parse(id);
   if(action==='s'){
     const flow=await locked(scope,async(tx,principal)=>{
       const current=await latest(tx,principal);
       if(!current||current.id!==id||current.state!=='complete'||current.expires_at.getTime()<=Date.now())throw Error('CHECKOUT_STALE');
       const floor=(await tx.$queryRaw<{checkout_floor_update:bigint}[]>`SELECT checkout_floor_update FROM assistant_telegram_customers WHERE id=${principal}::uuid`)[0].checkout_floor_update;
       if(current.update_id<floor)throw Error('CHECKOUT_STALE');
       const sent=await tx.$queryRaw<{turn_id:string}[]>`SELECT turn_id FROM assistant_telegram_customer_delivery_parts WHERE turn_id=${id}::uuid AND part=0 AND state='sent' AND telegram_message_id=${c.message.message_id}`;
       const choice=Number(index);
       if(sent.length!==1||(choice>=0&&!current.offered[choice]))throw Error('CHECKOUT_STALE');
       const old=(await tx.$queryRaw<Flow[]>`SELECT * FROM assistant_telegram_customer_checkout WHERE binding_id=${principal}::uuid`)[0];
       if(old?.source_turn===id&&old.source_stale)throw Error('CHECKOUT_STALE');
       if(old&&BigInt(event.update_id)<old.last_update_id)throw Error('CHECKOUT_STALE');
       const invalid=old?.request_id?(await tx.$queryRaw<{invalidated:boolean}[]>`SELECT invalidated FROM assistant_telegram_customer_requests WHERE id=${old.request_id}::uuid AND binding_id=${principal}::uuid`)[0]?.invalidated:false;
       if(old&&old.source_turn===id&&old.choice===choice&&old.expires_at.getTime()>Date.now()&&!invalid){await tx.$executeRaw`UPDATE assistant_telegram_customer_checkout SET last_update_id=GREATEST(last_update_id,${BigInt(event.update_id)}) WHERE binding_id=${principal}::uuid`;return old;}
       const bucket=(await tx.$queryRaw<{bucket:string}[]>`SELECT 'checkout:'||floor(extract(epoch from clock_timestamp())/60)::text AS bucket`)[0].bucket;
       const quota=await tx.$executeRaw`INSERT INTO assistant_telegram_customer_quotas(principal_id,bucket,count) VALUES(${principal}::uuid,${bucket},1) ON CONFLICT(principal_id,bucket) DO UPDATE SET count=assistant_telegram_customer_quotas.count+1 WHERE assistant_telegram_customer_quotas.count<${cfg.minute}`;
       if(quota!==1)throw Error('REQUEST_RATE_LIMIT');
       await clear(tx,principal);
       const result=await tx.$queryRaw<Flow[]>`INSERT INTO assistant_telegram_customer_checkout(binding_id,version,source_turn,choice,last_update_id,expires_at) VALUES(${principal}::uuid,${randomUUID()}::uuid,${id}::uuid,${choice},${event.update_id},${current.expires_at}) ON CONFLICT(binding_id) DO UPDATE SET version=EXCLUDED.version,source_turn=EXCLUDED.source_turn,source_stale=false,choice=EXCLUDED.choice,last_update_id=EXCLUDED.last_update_id,request_id=NULL,contact_update_id=NULL,prompt_state='unsent',prompt_message_id=NULL,expires_at=EXCLUDED.expires_at RETURNING *`;
       return result[0];
     });
     const claim=await locked(scope,(tx,principal)=>tx.$executeRaw`UPDATE assistant_telegram_customer_checkout SET prompt_state='sending' WHERE binding_id=${principal}::uuid AND version=${flow.version}::uuid AND prompt_state='unsent' AND expires_at>clock_timestamp()`);
     if(claim===1){
       try{
         await authorizeCustomer(scope);
         const receipt=await network.send(scope,'Укажите телефон или email для связи одним сообщением. Контакт сохранится в защищённом черновике и не передаётся ИИ. Затем покажу заявку для вашего подтверждения.',cancelSelectionButton(flow.version));
         await locked(scope,(tx,principal)=>tx.$executeRaw`UPDATE assistant_telegram_customer_checkout SET prompt_state='sent',prompt_message_id=${receipt.messageId} WHERE binding_id=${principal}::uuid AND version=${flow.version}::uuid AND prompt_state='sending'`);
       }catch{await locked(scope,(tx,principal)=>tx.$executeRaw`UPDATE assistant_telegram_customer_checkout SET prompt_state='unknown' WHERE binding_id=${principal}::uuid AND version=${flow.version}::uuid AND prompt_state='sending'`);}
     }
   }else{
     const flow=await locked(scope,async(tx,principal)=>{
       const value=(await tx.$queryRaw<Flow[]>`SELECT * FROM assistant_telegram_customer_checkout WHERE binding_id=${principal}::uuid`)[0];
       if(!value||value.expires_at.getTime()<=Date.now())throw Error('CHECKOUT_STALE');
       if(BigInt(event.update_id)<value.last_update_id)throw Error('CHECKOUT_STALE');
       if(action==='x'){
         const prompt=await tx.$queryRaw<{version:string}[]>`SELECT version FROM assistant_telegram_customer_checkout WHERE binding_id=${principal}::uuid AND version=${id}::uuid AND prompt_state='sent' AND prompt_message_id=${c.message.message_id}`;
         if(prompt.length!==1)throw Error('CHECKOUT_STALE');
       }else{
         const request=await tx.$queryRaw<{id:string;inquiry_id:string|null}[]>`SELECT id,inquiry_id FROM assistant_telegram_customer_requests WHERE id=${id}::uuid AND binding_id=${principal}::uuid AND selection_version=${value.version}::uuid AND stage_delivery='sent' AND stage_message_id=${c.message.message_id} AND (inquiry_id IS NOT NULL OR invalidated=false)`;
         if(request.length!==1||value.request_id!==id)throw Error('CHECKOUT_STALE');
       }
       const current=await latest(tx,principal);if(current?.id!==value.source_turn||current.state!=='complete')throw Error('CHECKOUT_STALE');
       await tx.$executeRaw`UPDATE assistant_telegram_customer_checkout SET last_update_id=GREATEST(last_update_id,${BigInt(event.update_id)}) WHERE binding_id=${principal}::uuid`;
       if(action!=='c')await clear(tx,principal);
       return value;
     });
     if(action==='c'){
       await customerRequestCommand(binding,{...message,message:{...message.message,text:'/confirm '+id}},token,flow.version);
       acknowledgment='Заявка подтверждена';
     }else acknowledgment='Выбор сброшен. Выберите другой вариант или напишите новые пожелания.';
   }
 }catch(error){
   const name=error instanceof Error?error.message:'';
   if(!['CHECKOUT_STALE','REQUEST_SELECTION_STALE','REQUEST_NOT_FOUND','REQUEST_EXPIRED','REQUEST_CHANGED_RECONFIRM','REQUEST_CHANGED','REQUEST_RATE_LIMIT'].includes(name))throw error;
   if(name==='REQUEST_CHANGED')await locked(scope,(tx,principal)=>tx.$executeRaw`UPDATE assistant_telegram_customer_requests SET invalidated=true WHERE binding_id=${principal}::uuid AND id=${c.data.split(':')[1]}::uuid AND inquiry_id IS NULL`);
   acknowledgment=name==='REQUEST_RATE_LIMIT'?'Достигнут лимит заявок. Новая заявка не создана. Попробуйте позже.':'Эта кнопка устарела. Обновите подбор и проверьте новую заявку.';
 }
 // This only dismisses the spinner; an uncertain acknowledgment never repeats
 // a selection, confirmation, Inquiry write or paid model call.
 try{await network.callbackReceipt(c.id,acknowledgment);}catch{/* no retry */}
 return true;
}

export async function customerContactMessage(binding:TelegramBinding,raw:unknown,token:string){
 const {scope,update}=telegramScope(binding,raw);
 const contact=publicBookingInquiryInput.shape.replyContact.safeParse(update.message.text.trim());
 if(!contact.success)return false;
 const flow=await locked(scope,async(tx,principal)=>{
   const value=(await tx.$queryRaw<Flow[]>`SELECT * FROM assistant_telegram_customer_checkout WHERE binding_id=${principal}::uuid AND expires_at>clock_timestamp()`)[0];
   const current=await latest(tx,principal);
   if(!value||current?.id!==value.source_turn||current.state!=='complete'||(BigInt(update.update_id)<=value.last_update_id&&BigInt(update.update_id)!==value.contact_update_id))return null;
   return value;
 });
 if(!flow)return false;
 const text=flow.choice===-1?`/handoff ${contact.data}`:`/request ${flow.choice+1} ${contact.data}`;
 return customerRequestCommand(binding,{...update,message:{...update.message,text}},token,flow.version);
}

export async function invalidateCustomerCheckout(binding:TelegramBinding,raw:unknown){
 if(process.env.MARIPOSA_TELEGRAM_REQUESTS!=='confirmed-v1')return;
 const {scope,update}=telegramScope(binding,raw);
 await locked(scope,async(tx,principal)=>{
   await tx.$executeRaw`UPDATE assistant_telegram_customers SET checkout_floor_update=GREATEST(checkout_floor_update,${BigInt(update.update_id)}) WHERE id=${principal}::uuid`;
   const flow=(await tx.$queryRaw<Flow[]>`SELECT * FROM assistant_telegram_customer_checkout WHERE binding_id=${principal}::uuid`)[0];
   if(flow&&BigInt(update.update_id)>flow.last_update_id){await clear(tx,principal);await tx.$executeRaw`UPDATE assistant_telegram_customer_checkout SET source_stale=true,last_update_id=${BigInt(update.update_id)} WHERE binding_id=${principal}::uuid`;}
   else if(!flow)await tx.$executeRaw`UPDATE assistant_telegram_customer_requests SET invalidated=true WHERE binding_id=${principal}::uuid AND stage_update_id<${update.update_id} AND inquiry_id IS NULL`;
 });
}
