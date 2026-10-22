import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {createInquiryRecord} from '@/lib/inquiries/record';
import {channelRentalQuote} from '@/lib/inquiries/channel-rental-quote';
import {quoteFingerprint,type ChannelRequestStore,type ConfirmedDraft,type ChannelRequest,type RequestQuote} from '@/lib/inquiries/confirmed-channel-request';
import {authorizeCustomer} from './customer-access';
import type {TelegramScope} from './adapter';

type Row={id:string;draft:ChannelRequest;quote:RequestQuote;expires_at:Date;inquiry_id:string|null};
const view=(r:Row):ConfirmedDraft=>({id:r.id,draft:r.draft,quote:r.quote,expiresAt:r.expires_at.getTime(),inquiryId:r.inquiry_id});
export function customerRequestStore(scope:TelegramScope,updateId:number):ChannelRequestStore {
 return {transaction:operation=>db.$transaction(async tx=>{
   if(process.env.MARIPOSA_TELEGRAM_REQUESTS!=='confirmed-v1')throw Error('REQUESTS_DISABLED');
   const principals=await tx.$queryRaw<{id:string}[]>`SELECT id FROM assistant_telegram_customers WHERE organization_id=${scope.organizationId}::uuid AND bot_id=${scope.botId} AND chat_id=${scope.chatId} AND sender_id=${scope.userId} AND generation=${scope.generation}::uuid FOR UPDATE`;
   if(principals.length!==1)throw Error('REQUEST_PRINCIPAL_DENIED');
   const binding=principals[0].id;await authorizeCustomer(scope,tx);
   return operation({authorize:()=>authorizeCustomer(scope,tx),
     read:async id=>{const rows=await tx.$queryRaw<Row[]>`SELECT * FROM assistant_telegram_customer_requests WHERE id=${id}::uuid AND binding_id=${binding}::uuid FOR UPDATE`;return rows[0]?view(rows[0]):null;},
     validate:async draft=>channelRentalQuote(tx,scope,draft),
     stage:async(draft,quote)=>{
       const hash=quoteFingerprint(draft);
       const old=await tx.$queryRaw<(Row&{request_hash:string})[]>`SELECT * FROM assistant_telegram_customer_requests WHERE binding_id=${binding}::uuid AND stage_update_id=${updateId}`;
       if(old[0]){if(old[0].request_hash!==hash)throw Error('REQUEST_UPDATE_CONFLICT');return view(old[0]);}
       const count=await tx.$queryRaw<{n:number}[]>`SELECT count(*)::int n FROM assistant_telegram_customer_requests WHERE binding_id=${binding}::uuid AND created_at>clock_timestamp()-interval '1 hour'`;
       if(count[0].n>=3)throw Error('REQUEST_RATE_LIMIT');
       const history=await tx.$queryRaw<{history_input:unknown;history_reply:unknown}[]>`SELECT history_input,history_reply FROM assistant_telegram_customer_turns WHERE binding_id=${binding}::uuid AND kind='dialogue' AND history_input IS NOT NULL ORDER BY update_id DESC LIMIT 5`;
       const rows=await tx.$queryRaw<Row[]>`INSERT INTO assistant_telegram_customer_requests(id,binding_id,stage_update_id,request_hash,draft,quote,history) VALUES(${randomUUID()}::uuid,${binding}::uuid,${updateId},${hash},${JSON.stringify(draft)}::jsonb,${JSON.stringify(quote)}::jsonb,${JSON.stringify(history.reverse())}::jsonb) RETURNING *`;
       return view(rows[0]);
     },
     create:async saved=>{
       // Shared cross-process intake lock and existing limits. Billing membership
       // must NOT be represented as the employee who created a customer's request.
       await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`showroom:${scope.organizationId}`},0))`;
       const recent={organizationId:scope.organizationId,source:'TELEGRAM' as const,createdAt:{gte:new Date(Date.now()-3600000)}};
       if(await tx.inquiry.count({where:recent})>=30||await tx.inquiry.count({where:{...recent,replyContact:saved.draft.contact}})>=3)throw Error('REQUEST_RATE_LIMIT');
       const current=await channelRentalQuote(tx,scope,saved.draft);
       if(current.fingerprint!==saved.quote.fingerprint)throw Error('REQUEST_CHANGED');
       const histories=await tx.$queryRaw<{history:{history_input?:{messages?:{role:string;content:string}[]};history_reply?:{message?:string}}[]}[]>`SELECT history FROM assistant_telegram_customer_requests WHERE id=${saved.id}::uuid AND binding_id=${binding}::uuid`;
       const transcript=(histories[0]?.history??[]).flatMap(h=>[
         h.history_input?.messages?.at(-1)?.content?`Клиент: ${h.history_input.messages.at(-1)!.content}`:'',
         h.history_reply?.message?`Менеджер: ${h.history_reply.message}`:'',
       ]).filter(Boolean).join('\n').slice(0,4000);
       const record=await createInquiryRecord(tx,{organizationId:scope.organizationId,branchId:scope.branchId,source:'TELEGRAM',creationKey:saved.id,creationHash:quoteFingerprint(saved.draft),
         subject:saved.draft.purpose==='exception'?'Telegram: нужна помощь сотрудника':'Заявка клиента из Telegram',replyContact:saved.draft.contact,
         requestText:[...saved.quote.summary,`Клиент подтвердил заявку. История подбора: ${saved.id}. Резерв и оплата не созданы.`,transcript?'Последние сообщения подбора:\n'+transcript:''].filter(Boolean).join('\n'),
         requestedFrom:current.period?.from??null,requestedUntil:current.period?.until??null,requestedSize:current.items.map(i=>i.size).join(' / ').slice(0,100)||null,
         items:{create:current.items.map(i=>({organizationId:scope.organizationId,productVariantId:i.id,nameSnapshot:i.name+(i.execution?' — '+i.execution:''),skuSnapshot:i.sku,sizeSnapshot:i.size}))}},
         {source:'API',itemCount:current.items.length});
       return record.id;
     },
     receipt:async(id,inquiryId)=>{const n=await tx.$executeRaw`UPDATE assistant_telegram_customer_requests SET inquiry_id=${inquiryId}::uuid WHERE id=${id}::uuid AND binding_id=${binding}::uuid AND inquiry_id IS NULL`;if(n!==1)throw Error('REQUEST_RECEIPT_CONFLICT');},
   });
 },{timeout:10000})};
}
