import 'server-only';
import {db} from '@/lib/db';
import {createHash,randomUUID} from 'node:crypto';
import {customerConfig} from './customer-config';
import {telegramEnvelope} from './runtime';
import {telegramNetwork} from './network';
import {customerNotices} from './customer-notices';
import type {TelegramBinding} from './adapter';
// All SQL input values parameterized. No public principal is a staff membership.
export async function customerEnvelope(raw:unknown,botId:number,token:string,limited:boolean|keyof typeof customerNotices=false){
 const cfg=customerConfig();if(!cfg)throw Error('CUSTOMER_DISABLED');
 const e=telegramEnvelope.parse(raw),m=e.message;
 if(m.from.id!==m.chat.id||m.from.is_bot||m.date*1000>Date.now()+60000||m.date*1000<Date.now()-600000)return null;
 const command=m.text.trim();const hash=createHash('sha256').update(JSON.stringify(e)).digest('hex');
 const outcome=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'telegram-customer-onboard:'+cfg.organizationId},0))`;
  const branch=await tx.branch.findFirst({where:{id:cfg.branchId,organizationId:cfg.organizationId,isPublic:true,status:'ACTIVE',organization:{status:'ACTIVE'}},select:{id:true}});if(!branch)throw Error('CUSTOMER_BRANCH_DENIED');
  type P={id:string;generation:string;enabled:boolean;consent_at:Date|null;consent_version:string|null;starts_at:Date;expires_at:Date};
  let [p]=await tx.$queryRaw<P[]>`SELECT * FROM assistant_telegram_customers WHERE organization_id=${cfg.organizationId}::uuid AND bot_id=${botId} AND sender_id=${m.from.id} AND chat_id=${m.chat.id} FOR UPDATE`;
  if(!p){
   const [n]=await tx.$queryRaw<{n:bigint}[]>`SELECT count(*) as n FROM assistant_telegram_customers WHERE organization_id=${cfg.organizationId}::uuid AND starts_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty'`;
   if(n.n>=BigInt(200))return null;
   [p]=await tx.$queryRaw<P[]>`INSERT INTO assistant_telegram_customers(id,organization_id,budget_membership_id,branch_id,bot_id,sender_id,chat_id,generation,enabled,starts_at,expires_at) VALUES(${randomUUID()}::uuid,${cfg.organizationId}::uuid,${cfg.membershipId}::uuid,${cfg.branchId}::uuid,${botId},${m.from.id},${m.chat.id},${randomUUID()}::uuid,false,clock_timestamp(),${new Date(cfg.until)}) RETURNING *`;
  }
  if(p.expires_at.getTime()<=Date.now())return null;
  const old=await tx.$queryRaw<{id:string;request_hash:string;kind:string}[]>`SELECT id,request_hash,kind FROM assistant_telegram_customer_turns WHERE binding_id=${p.id}::uuid AND update_id=${e.update_id}`;
  if(old[0]){if(old[0].request_hash!==hash)throw Error('UPDATE_CONFLICT');if(old[0].kind==='notice')return null;}
  let notice:keyof typeof customerNotices|null=typeof limited==='string'?limited:limited?'limited':null;
  if(command==='/stop'||command==='/agree'){
   const agreed=command==='/agree';
   const n=await tx.$executeRaw`UPDATE assistant_telegram_customers SET enabled=${agreed},consent_at=CASE WHEN ${agreed} THEN clock_timestamp() ELSE consent_at END,consent_version=CASE WHEN ${agreed} THEN ${cfg.consentVersion} ELSE consent_version END,last_control_update=${e.update_id} WHERE id=${p.id}::uuid AND last_control_update<${e.update_id}`;
   if(n!==1)return null;notice=agreed?'ready':'stopped';
  }else if(!p.enabled||!p.consent_at||p.consent_version!==cfg.consentVersion||command==='/start')notice='consent';
  if(notice){
   const [n]=await tx.$queryRaw<{n:bigint}[]>`SELECT count(*) as n FROM assistant_telegram_customer_turns WHERE kind='notice' AND created_at>now()-interval '1 minute' AND (binding_id=${p.id}::uuid)`;
   const [all]=await tx.$queryRaw<{n:bigint}[]>`SELECT count(*) as n FROM assistant_telegram_customer_turns t JOIN assistant_telegram_customers c ON c.id=t.binding_id WHERE c.organization_id=${cfg.organizationId}::uuid AND t.kind='notice' AND t.created_at>now()-interval '1 minute'`;
   if(n.n>=BigInt(3)||all.n>=BigInt(60))return null;
   const id=randomUUID();await tx.$executeRaw`INSERT INTO assistant_telegram_customer_turns(id,binding_id,update_id,request_hash,envelope,kind,state) VALUES(${id}::uuid,${p.id}::uuid,${e.update_id},${hash},'{}'::jsonb,'notice','complete')`;
   return {notice,id};
  }
  const binding:TelegramBinding={enabled:true,consent:true,organizationId:cfg.organizationId,membershipId:cfg.membershipId,branchId:cfg.branchId,botId,userId:m.from.id,chatId:m.chat.id,generation:p.generation,start:p.starts_at.getTime(),until:p.expires_at.getTime()};
  return {binding};
 });
 if(!outcome)return null;
 if(outcome.notice){
  const claimed=await db.$executeRaw`UPDATE assistant_telegram_customer_turns SET delivery_state='sending' WHERE id=${outcome.id}::uuid AND kind='notice' AND delivery_state='unsent'`;
  if(claimed!==1)return null;
  try{const receipt=await telegramNetwork(token).notice(m.from.id,outcome.notice);await db.$executeRaw`UPDATE assistant_telegram_customer_turns SET delivery_state='sent',telegram_message_id=${receipt.messageId} WHERE id=${outcome.id}::uuid AND delivery_state='sending'`;}catch{await db.$executeRaw`UPDATE assistant_telegram_customer_turns SET delivery_state='unknown' WHERE id=${outcome.id}::uuid AND delivery_state='sending'`;}
  return null;
 }
 return {binding:outcome.binding,event:e};
}
