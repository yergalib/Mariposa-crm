import 'server-only';
import {createHash} from 'node:crypto';
export {authenticateWebhook} from './webhook-auth';
import {z} from 'zod';
import {chatInput, type ChatInput, type ChatReply} from '../chat/contracts';
import {assertCheckpointPrivacy, type RecordedTurn} from '../chat/recorded-turn';
import {prepareContinuation, finishContinuation, type ContinuationRepository} from '../chat/review-continuation';

// Unwired local transport. No route, HTTP client, token reader or implicit enablement.
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const updateSchema = z.object({update_id:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  message:z.object({message_id:id, date:z.number().int(), from:z.object({id,is_bot:z.literal(false)}),
    chat:z.object({id,type:z.literal('private')}),text:z.string().trim().min(1).max(700)})});
export type TelegramBinding = {enabled:boolean; organizationId:string; membershipId:string; branchId:string;
  botId:number; userId:number; chatId:number; generation:string; start:number; until:number; consent:boolean};
export type TelegramScope = Readonly<TelegramBinding & {principal:string}>;
export interface TelegramPorts {
  // Must recheck real active OWNER membership, tenant, branch, consent and window.
  authorize(scope:TelegramScope):Promise<void>;
  // Atomically scope by org/bot/generation/chat/update. Reject changed hash;
  // serialize all turns of this chat; never reclaim unknown/running work.
  repository(scope:TelegramScope,envelope?:unknown):ContinuationRepository<RecordedTurn>;
  history(scope:TelegramScope):Promise<Pick<ChatInput,'messages'|'context'>>;
  // Calls existing recordTurn / reviewRecordedTurn through shared provider ledger.
  plan(scope:TelegramScope,input:ChatInput):Promise<RecordedTurn>;
  review(scope:TelegramScope,turn:RecordedTurn):Promise<RecordedTurn>;
  // Atomic append-if-absent by update key; only reviewed output, no delivery claim.
  saveHistory(scope:TelegramScope,key:string,input:ChatInput,reply:ChatReply):Promise<void>;
}
export function telegramScope(binding:TelegramBinding,raw:unknown,now=Date.now()){
  if(!binding.enabled||!binding.consent||now<binding.start||now>=binding.until)throw new Error('Telegram disabled');
  const u=updateSchema.parse(raw),m=u.message;
  if(m.from.id!==binding.userId||m.chat.id!==binding.chatId||m.chat.id!==m.from.id)throw new Error('Telegram owner denied');
  if(m.date*1000<binding.start||m.date*1000>now+60000)throw new Error('Telegram stale update');
  const principal=createHash('sha256').update(JSON.stringify([binding.organizationId,binding.botId,binding.generation,m.chat.id,m.from.id])).digest('hex');
  return {scope:Object.freeze({...binding,principal}),update:u};
}
export async function prepareTelegram(binding:TelegramBinding,raw:unknown,ports:TelegramPorts,now=Date.now()){
  const {scope,update}=telegramScope(binding,raw,now);await ports.authorize(scope);
  const key=String(update.update_id),hash=createHash('sha256').update(JSON.stringify(update)).digest('hex');
  let planned=false;
  // Build history only inside first accepted claim, so webhook retry cannot change
  // its hash after an earlier successful turn has appended history.
  const result=await prepareContinuation(ports.repository(scope,update),key,hash,async()=>{
    planned=true;
    await ports.authorize(scope);
    const saved=await ports.history(scope);
    const input=chatInput.parse({syntheticOnly:true,branchId:binding.branchId,context:saved.context,
      messages:[...saved.messages.slice(-8),{role:'user',content:update.message.text}]});
    assertCheckpointPrivacy(input);
    return ports.plan(scope,input);
  },()=>now);
  return {...result,planned};
}
export async function finishTelegram(binding:TelegramBinding,raw:unknown,checkpointId:string,ports:TelegramPorts,now=Date.now()){
  const {scope,update}=telegramScope(binding,raw,now);await ports.authorize(scope);
  const repo=ports.repository(scope);
  // Repository read is scoped, but checkpoint must ALSO belong to this update.
  const hash=createHash('sha256').update(JSON.stringify(update)).digest('hex');
  const row=await repo.read(checkpointId);
  if(!row||row.requestHash!==hash)throw new Error('Telegram checkpoint denied');
  const alreadyComplete=row.state==='complete';
  const completed=await finishContinuation(repo,checkpointId,async turn=>{
    await ports.authorize(scope);return ports.review(scope,turn);
  },()=>now);
  if(completed.status==='complete'){
    // Stored complete checkpoints omit public DTOs. Replay refreshes CRM facts
    // using the stored verdict; the shared engine forbids another model call.
    const turn=alreadyComplete?await ports.review(scope,completed.result):completed.result;
    if(turn.kind!=='complete')throw new Error('Telegram unreviewed result');
    await ports.authorize(scope);
    await ports.saveHistory(scope,String(update.update_id),turn.source.input,turn.reply);
    return {...completed,result:turn};
  }
  // No sendMessage here: delivery requires separate atomic claim and receipt.
  return completed;
}
