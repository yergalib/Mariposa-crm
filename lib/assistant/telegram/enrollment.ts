import 'server-only';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {requireOwnerDaySession} from '../owner-day-access';
import {ownerDayConfig} from '../owner-day-config';
import {requireInquiryTransactionAccess} from '@/lib/showroom/inquiry-access';
import type {telegramEnvelope} from './runtime';
import type {z} from 'zod';
export async function startTelegramEnrollment(botId:number,branchId:string){
  const owner=await requireOwnerDaySession(),config=ownerDayConfig();
  if(!config)throw new Error('Telegram disabled');
  const challenge=randomBytes(32).toString('base64url'),id=randomUUID();
  const hash=createHash('sha256').update(challenge).digest('hex');
  await db.$transaction(async tx=>{
    await requireInquiryTransactionAccess(tx,owner);
    if(!await tx.branch.findFirst({where:{id:branchId,organizationId:owner.organizationId,isPublic:true,status:'ACTIVE'},select:{id:true}}))throw new Error('Branch unavailable');
    await tx.$executeRaw`INSERT INTO assistant_telegram_enrollments(id,organization_id,membership_id,session_id,branch_id,bot_id,challenge_hash,expires_at)
      VALUES(${id}::uuid,${owner.organizationId}::uuid,${owner.membershipId}::uuid,${owner.sessionId}::uuid,${branchId}::uuid,${botId},${hash},LEAST(clock_timestamp()+interval '10 minutes',${new Date(config.until)}))`;
  });
  return {enrollmentId:id,command:'/start '+challenge,notice:'Отправьте команду своему боту, затем подтвердите показанный Telegram ID здесь. Ответы пока не включены.'};
}
export async function redeemTelegramEnrollment(update:z.infer<typeof telegramEnvelope>,botId:number){
  if(update.message.from.id!==update.message.chat.id||update.message.from.is_bot)throw new Error('Private owner chat required');
  const match=update.message.text.match(/^\/start ([A-Za-z0-9_-]{43})$/);if(!match)return;
  const hash=createHash('sha256').update(match[1]).digest('hex');
  await db.$executeRaw`UPDATE assistant_telegram_enrollments SET sender_id=${update.message.from.id},chat_id=${update.message.chat.id}
    WHERE challenge_hash=${hash} AND bot_id=${botId} AND expires_at>clock_timestamp() AND confirmed_at IS NULL AND sender_id IS NULL`;
  // No response, provider, or binding activation on possession of the challenge.
}
export async function inspectTelegramEnrollment(id:string,botId:number,confirm=false){
  const owner=await requireOwnerDaySession(),config=ownerDayConfig();if(!config)throw new Error('Telegram disabled');
  return db.$transaction(async tx=>{
    await requireInquiryTransactionAccess(tx,owner);
    const rows=await tx.$queryRaw<{branch_id:string;sender_id:bigint|null;chat_id:bigint|null;confirmed_at:Date|null}[]>`SELECT branch_id,sender_id,chat_id,confirmed_at FROM assistant_telegram_enrollments
      WHERE id=${id}::uuid AND organization_id=${owner.organizationId}::uuid AND membership_id=${owner.membershipId}::uuid
      AND session_id=${owner.sessionId}::uuid AND bot_id=${botId} AND expires_at>clock_timestamp() FOR UPDATE`;
    const row=rows[0];if(!row)throw new Error('Enrollment unavailable');
    if(!confirm)return {status:row.confirmed_at?'confirmed':row.sender_id?'awaiting_owner_confirmation':'awaiting_bot_command',senderId:row.sender_id?.toString()??null};
    if(!row.sender_id||row.sender_id!==row.chat_id)throw new Error('Enrollment not proven');
    if(row.confirmed_at)return {status:'confirmed'};
    await tx.$executeRaw`INSERT INTO assistant_telegram_bindings(id,organization_id,membership_id,branch_id,bot_id,sender_id,chat_id,generation,enabled,consent_at,starts_at,expires_at)
      VALUES(${randomUUID()}::uuid,${owner.organizationId}::uuid,${owner.membershipId}::uuid,${row.branch_id}::uuid,${botId},${row.sender_id},${row.chat_id},${id}::uuid,true,clock_timestamp(),clock_timestamp(),${new Date(config.until)})`;
    await tx.$executeRaw`UPDATE assistant_telegram_enrollments SET confirmed_at=clock_timestamp() WHERE id=${id}::uuid`;
    return {status:'confirmed'};
  });
}
