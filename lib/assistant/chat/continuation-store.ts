import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {requireOwnerDaySession,requireOwnerDayWriteWindow} from '../owner-day-access';
import {AssistantError} from './limits';
import {checkpointRecord,type RecordedTurn} from './recorded-turn';
import type {ContinuationRepository,ContinuationRow,ContinuationState} from './review-continuation';
type Row={id:string;request_hash:string;state:ContinuationState;expires_at:Date;candidate:RecordedTurn|null;result:RecordedTurn|null};
const view=(r:Row):ContinuationRow<RecordedTurn>=>({id:r.id,requestHash:r.request_hash,state:r.state,expiresAt:r.expires_at.getTime(),candidate:r.candidate,result:r.result});
export async function continuationRepository():Promise<ContinuationRepository<RecordedTurn>&{findKey:(key:string)=>Promise<ContinuationRow<RecordedTurn>|null>}>{
 const session=await requireOwnerDaySession();
 const org=session.organizationId,member=session.membershipId,principal=createHash('sha256').update(JSON.stringify([org,session.userId,session.sessionId])).digest('hex');
 const gate=async()=>{const current=await requireOwnerDaySession();if(current.organizationId!==org||current.membershipId!==member||current.sessionId!==session.sessionId)throw new AssistantError('Продолжение принадлежит другой сессии.',403);};
 const read=async(id:string)=>{await gate();const [r]=await db.$queryRaw<Row[]>`SELECT id,request_hash,state,expires_at,candidate,result FROM assistant_review_checkpoints WHERE id=${id}::uuid AND organization_id=${org}::uuid AND membership_id=${member}::uuid AND principal_hash=${principal}`;return r?view(r):null;};
 return {
  read,
  async findKey(key){await gate();const [r]=await db.$queryRaw<Row[]>`SELECT id,request_hash,state,expires_at,candidate,result FROM assistant_review_checkpoints WHERE organization_id=${org}::uuid AND membership_id=${member}::uuid AND principal_hash=${principal} AND idempotency_key=${key}::uuid`;return r?view(r):null;},
  async begin(key,hash){await gate();return db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'assistant-provider:'+org},0))`;
   await requireOwnerDayWriteWindow(tx);
   const id=randomUUID();
   const inserted=await tx.$executeRaw`INSERT INTO assistant_review_checkpoints(id,organization_id,membership_id,principal_hash,idempotency_key,request_hash,state,expires_at) VALUES(${id}::uuid,${org}::uuid,${member}::uuid,${principal},${key}::uuid,${hash},'planning',now()+interval '10 minutes') ON CONFLICT(organization_id,membership_id,principal_hash,idempotency_key) DO NOTHING`;
   const [r]=await tx.$queryRaw<Row[]>`SELECT id,request_hash,state,expires_at,candidate,result FROM assistant_review_checkpoints WHERE organization_id=${org}::uuid AND membership_id=${member}::uuid AND principal_hash=${principal} AND idempotency_key=${key}::uuid`;
   if(!r||r.request_hash!==hash)throw new AssistantError('Этот запрос уже использован с другими условиями.',409);
   return {created:inserted===1,row:view(r)};
  });},
  async stage(id,hash,candidate){await gate();candidate=checkpointRecord(candidate);return db.$transaction(async tx=>{
   await requireOwnerDayWriteWindow(tx);
   return (await tx.$executeRaw`UPDATE assistant_review_checkpoints SET state='review_ready',candidate=${JSON.stringify(candidate)}::jsonb WHERE id=${id}::uuid AND organization_id=${org}::uuid AND membership_id=${member}::uuid AND principal_hash=${principal} AND request_hash=${hash} AND state='planning' AND expires_at>clock_timestamp()`)===1;
  });},
  async claimReview(id){await gate();return db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'assistant-provider:'+org},0))`;
   await requireOwnerDayWriteWindow(tx);
   const [r]=await tx.$queryRaw<Row[]>`UPDATE assistant_review_checkpoints SET state='review_running' WHERE id=${id}::uuid AND organization_id=${org}::uuid AND membership_id=${member}::uuid AND principal_hash=${principal} AND state='review_ready' AND expires_at>clock_timestamp() RETURNING id,request_hash,state,expires_at,candidate,result`;
   return r?view(r):null;
  });},
  async complete(id,result){await gate();result=checkpointRecord(result);await db.$transaction(async tx=>{
   await requireOwnerDayWriteWindow(tx);
   const n=await tx.$executeRaw`UPDATE assistant_review_checkpoints SET state='complete',result=${JSON.stringify(result)}::jsonb WHERE id=${id}::uuid AND organization_id=${org}::uuid AND membership_id=${member}::uuid AND principal_hash=${principal} AND state='review_running' AND expires_at>clock_timestamp()`;
   if(n!==1)throw new AssistantError('Подтверждение результата не сохранено.',503);
  });},
  async block(id){await gate();await db.$executeRaw`UPDATE assistant_review_checkpoints SET state='blocked' WHERE id=${id}::uuid AND organization_id=${org}::uuid AND membership_id=${member}::uuid AND principal_hash=${principal} AND state IN ('planning','review_ready','review_running')`;},
 };
}
