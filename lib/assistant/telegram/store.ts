import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {chatInput,type ChatReply} from '../chat/contracts';
import {checkpointRecord,assertCheckpointPrivacy,type RecordedTurn} from '../chat/recorded-turn';
import type {ContinuationRow,ContinuationState} from '../chat/review-continuation';
import type {TelegramPorts,TelegramScope} from './adapter';
import type {Prisma} from '@/generated/prisma/client';
import type {DeliveryPorts} from './delivery';
type Tx=Prisma.TransactionClient;
type Row={id:string;request_hash:string;state:ContinuationState;candidate:RecordedTurn|null;result:RecordedTurn|null;expires_at:Date};
const view=(r:Row):ContinuationRow<RecordedTurn>=>({id:r.id,requestHash:r.request_hash,state:r.state,candidate:r.candidate,result:r.result,expiresAt:r.expires_at.getTime()});

// Unwired until the reviewed schema and identity binding are approved. All SQL
// uses parameters; a binding row is locked before each state/history operation.
export function telegramStore(authorize:(scope:TelegramScope,tx?:Tx)=>Promise<void>):Pick<TelegramPorts,'repository'|'history'|'saveHistory'> & Pick<DeliveryPorts,'claim'|'receipt'|'unknown'>{
  async function scoped<T>(s:TelegramScope,operation:(tx:Tx,binding:string)=>Promise<T>):Promise<T>{
    // Lock then authorize inside the transaction before any operation.
    return db.$transaction(async tx=>{
      const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM assistant_telegram_bindings
        WHERE organization_id=${s.organizationId}::uuid AND membership_id=${s.membershipId}::uuid
        AND branch_id=${s.branchId}::uuid AND bot_id=${s.botId} AND sender_id=${s.userId}
        AND chat_id=${s.chatId} AND generation=${s.generation}::uuid AND enabled=true
        AND consent_at IS NOT NULL AND starts_at<=clock_timestamp() AND expires_at>clock_timestamp()
        FOR UPDATE`;
      if(rows.length!==1)throw new Error('Telegram binding unavailable');
      await authorize(s,tx);
      return operation(tx,rows[0].id);
    });
  }
  return {
    claim:(s,key)=>scoped(s,async(tx,binding)=>(await tx.$executeRaw`UPDATE assistant_telegram_turns SET delivery_state='sending'
      WHERE binding_id=${binding}::uuid AND update_id=${BigInt(key)} AND state='complete' AND history_input IS NOT NULL
      AND expires_at>clock_timestamp() AND delivery_state='unsent'`)===1),
    receipt:(s,key,messageId)=>scoped(s,async(tx,binding)=>{
      const n=await tx.$executeRaw`UPDATE assistant_telegram_turns SET delivery_state='sent',telegram_message_id=${messageId}
        WHERE binding_id=${binding}::uuid AND update_id=${BigInt(key)} AND delivery_state='sending'`;
      if(n!==1)throw new Error('Telegram delivery receipt unconfirmed');
    }),
    unknown:(s,key)=>scoped(s,async(tx,binding)=>{await tx.$executeRaw`UPDATE assistant_telegram_turns SET delivery_state='unknown'
      WHERE binding_id=${binding}::uuid AND update_id=${BigInt(key)} AND delivery_state='sending'`;}),
    repository:(s,envelope)=>({
      begin:(key,hash)=>scoped(s,async(tx,binding)=>{
        if(!/^\d{1,16}$/.test(key))throw new Error('Invalid Telegram update');
        const old=await tx.$queryRaw<Row[]>`SELECT * FROM assistant_telegram_turns WHERE binding_id=${binding}::uuid AND update_id=${BigInt(key)}`;
        if(old[0]){if(old[0].request_hash!==hash)throw new Error('Telegram update conflict');return {created:false,row:view(old[0])};}
        const newer=await tx.$queryRaw<{id:string}[]>`SELECT id FROM assistant_telegram_turns WHERE binding_id=${binding}::uuid AND update_id>${BigInt(key)} LIMIT 1`;
        if(newer.length)throw new Error('Telegram out-of-order update');
        if(!envelope)throw new Error('Telegram envelope required');
        assertCheckpointPrivacy(envelope);
        const rows=await tx.$queryRaw<Row[]>`INSERT INTO assistant_telegram_turns(id,binding_id,update_id,request_hash,state,envelope)
          VALUES(${randomUUID()}::uuid,${binding}::uuid,${BigInt(key)},${hash},'planning',${JSON.stringify(envelope)}::jsonb) RETURNING *`;
        return {created:true,row:view(rows[0])};
      }),
      read:id=>scoped(s,async(tx,binding)=>{
        const rows=await tx.$queryRaw<Row[]>`SELECT * FROM assistant_telegram_turns WHERE id=${id}::uuid AND binding_id=${binding}::uuid`;
        return rows[0]?view(rows[0]):null;
      }),
      stage:(id,hash,candidate)=>scoped(s,async(tx,binding)=>{
        const safe=checkpointRecord(candidate);
        const n=await tx.$executeRaw`UPDATE assistant_telegram_turns SET state='review_ready',candidate=${JSON.stringify(safe)}::jsonb
          WHERE id=${id}::uuid AND binding_id=${binding}::uuid AND request_hash=${hash} AND state='planning' AND expires_at>clock_timestamp()`;
        return n===1;
      }),
      claimReview:id=>scoped(s,async(tx,binding)=>{
        const rows=await tx.$queryRaw<Row[]>`UPDATE assistant_telegram_turns SET state='review_running'
          WHERE id=${id}::uuid AND binding_id=${binding}::uuid AND state='review_ready' AND expires_at>clock_timestamp() RETURNING *`;
        return rows[0]?view(rows[0]):null;
      }),
      complete:(id,result)=>scoped(s,async(tx,binding)=>{
        const safe=checkpointRecord(result);
        const n=await tx.$executeRaw`UPDATE assistant_telegram_turns SET state='complete',result=${JSON.stringify(safe)}::jsonb
          WHERE id=${id}::uuid AND binding_id=${binding}::uuid AND state='review_running' AND expires_at>clock_timestamp()`;
        if(n!==1)throw new Error('Telegram completion unconfirmed');
      }),
      block:id=>scoped(s,async(tx,binding)=>{await tx.$executeRaw`UPDATE assistant_telegram_turns SET state='blocked'
        WHERE id=${id}::uuid AND binding_id=${binding}::uuid AND state IN ('planning','review_ready','review_running')`;}),
    }),
    history:s=>scoped(s,async(tx,binding)=>{
      const rows=await tx.$queryRaw<{history_input:unknown;history_reply:ChatReply}[]>`SELECT history_input,history_reply FROM assistant_telegram_turns
        WHERE binding_id=${binding}::uuid AND state='complete' AND history_input IS NOT NULL ORDER BY created_at DESC LIMIT 4`;
      const messages: {role:'user'|'assistant';content:string}[]=[];
      for(const r of [...rows].reverse()){
        const input=chatInput.parse(r.history_input);
        messages.push(input.messages[input.messages.length-1],{role:'assistant',content:r.history_reply.message});
      }
      return {messages,context:rows[0]?.history_reply.context};
    }),
    saveHistory:(s,key,input,reply)=>scoped(s,async(tx,binding)=>{
      // Keep continuity, never contacts, product DTOs or raw Telegram payload.
      const minimal={message:reply.message,cards:[],context:reply.context};
      assertCheckpointPrivacy({input,reply:minimal});
      await tx.$executeRaw`UPDATE assistant_telegram_turns SET history_input=${JSON.stringify(input)}::jsonb,history_reply=${JSON.stringify(minimal)}::jsonb
        WHERE binding_id=${binding}::uuid AND update_id=${BigInt(key)} AND state='complete' AND history_input IS NULL`;
    }),
  };
}
