import 'server-only';
import {chatInput,hasSensitiveText,type ChatInput,type ChatReply} from './contracts';
import {runAssistantConversation} from './consultation';
import {ownerTestPolicy} from './owner-test';
import {AssistantError} from './limits';
import type {ChatProvider,ProviderResult} from './provider';
import type {CrmToolRunner} from './tools';
import type {DiagnosticSink} from './diagnostics';
type ReviewTurn={kind:'review';input:ChatInput;tape:ProviderResult[];calendarNow:number;policy:string};
export type RecordedTurn = ReviewTurn | {kind:'complete';reply:ChatReply;source:ReviewTurn;reviewReceipt?:ProviderResult};
export function checkpointRecord(turn:RecordedTurn):RecordedTurn{
  // Product DTOs/contacts are refreshed for delivery, never retained here.
  const stored:RecordedTurn=turn.kind==='complete'?{...turn,reply:{message:'',cards:[]}}:turn;
  assertCheckpointPrivacy(stored);return stored;
}
class ReviewBoundary extends Error {}
const policy=()=>{const p=ownerTestPolicy();return p.model+'|'+p.priceAck;};
export function assertCheckpointPrivacy(value:unknown){
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>60000)throw new AssistantError('Слишком большой результат подбора.',413);
  const walk=(v:unknown):void=>{
    if(typeof v==='string'){
      // Structured UUIDs are product/branch references, not telephone numbers.
      if(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v))return;
      if(v.startsWith('{')||v.startsWith('[')){try{const parsed=JSON.parse(v);walk(parsed);return;}catch(error){if(error instanceof AssistantError)throw error;}}
      if(hasSensitiveText(v)||/\b(?:sk-[a-z0-9_-]{12,}|bearer\s+\S+)/i.test(v))throw new AssistantError('Контакты и личные данные не сохраняются в техническом продолжении.',400);
    }
    if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);
  };walk(value);
}
export async function recordTurn(raw:unknown,provider:ChatProvider,tools:CrmToolRunner,signal:AbortSignal,diagnostic?:DiagnosticSink):Promise<RecordedTurn>{
  const input=chatInput.parse(raw),tape:ProviderResult[]=[],calendarNow=Date.now();
  const source=():ReviewTurn=>({kind:'review',input:{...input,messages:input.messages.length===1?input.messages:[{role:'user',content:'Продолжение подбора.'},...input.messages.slice(-2)]},tape,calendarNow,policy:policy()});
  if(input.messages.some(m=>hasSensitiveText(m.content)))throw new AssistantError('Уберите личные данные из сообщения.',400);
  const recording:ChatProvider={create:async(body,s)=>{
    if(body.text?.format?.type==='json_schema'&&body.text.format.name==='conversation_boundary_review')throw new Error('Review must be deferred');
    const result=await provider.create(body,s);const {usage:ignored,...copy}=result;void ignored;
    copy.output=copy.output.filter(item=>item.type==='function_call');
    tape.push(structuredClone(copy));return result;
  }};
  try{
    const reply=await runAssistantConversation(input,recording,tools,signal,diagnostic,{calendarNow,afterModel:()=>{
      const last=tape.at(-1);
      // Late settled final output is untrusted replay material, never a UI answer.
      if(signal.aborted&&last?.status==='completed'&&!last.output.some(x=>x.type==='function_call'))throw new ReviewBoundary();
    },beforeReview:()=>{throw new ReviewBoundary()}});
    return checkpointRecord({kind:'complete',reply,source:source()});
  }catch(error){
    if(!(error instanceof ReviewBoundary))throw error;
    // Replay uses only current user, previous assistant and previous user; older
    // chat prose was needed by planning, not by deterministic evidence validation.
    const candidate:RecordedTurn=source();
    assertCheckpointPrivacy(candidate);return candidate;
  }
}
export async function reviewRecordedTurn(turn:RecordedTurn,provider:ChatProvider,tools:CrmToolRunner,signal:AbortSignal,diagnostic?:DiagnosticSink):Promise<RecordedTurn>{
  assertCheckpointPrivacy(checkpointRecord(turn));
  if(turn.kind==='complete'){
    // Lost HTTP acknowledgement: refresh actual catalogue facts, re-use the
    // saved semantic verdict, and categorically forbid another paid request.
    const receipt=turn.reviewReceipt;
    return replayTurn(turn.source,{create:async()=>{if(!receipt)throw new Error('No stored review receipt');return receipt;}},tools,signal,diagnostic);
  }
  return replayTurn(turn,provider,tools,signal,diagnostic);
}
async function replayTurn(turn:ReviewTurn,provider:ChatProvider,tools:CrmToolRunner,signal:AbortSignal,diagnostic?:DiagnosticSink):Promise<RecordedTurn>{
  if(turn.policy!==policy()||turn.tape.length>3)throw new AssistantError('Условия проверки изменились. Продолжение остановлено.',409);
  let index=0,reviews=0,reviewFailed=false,reviewReceipt:ProviderResult|undefined;
  const replay:ChatProvider={create:async(body,s)=>{
    const isReview=body.text?.format?.type==='json_schema'&&body.text.format.name==='conversation_boundary_review';
    if(isReview){if(index!==turn.tape.length||++reviews!==1)throw new Error('Invalid review replay');try{const response=await provider.create(body,s);const {usage:ignored,...receipt}=response;void ignored;receipt.output=[];reviewReceipt=receipt;return response;}catch(error){reviewFailed=true;throw error;}}
    if(index>=turn.tape.length)throw new Error('Planning replay exhausted');return structuredClone(turn.tape[index++]);
  }};
  // CRM tools read fresh, with current tenant/publication/branch/availability guards.
  // Old model calls are replayed as data, never sent to the provider again.
  const reply=await runAssistantConversation(turn.input,replay,tools,signal,diagnostic,{calendarNow:turn.calendarNow,onReviewUnavailable:()=>{throw new AssistantError('Исход проверки не подтверждён. Автоматического повтора нет.',503);}});
  if(reviewFailed||reply.recoveryReason==='review_unavailable')throw new AssistantError('Исход проверки не подтверждён. Автоматического повтора нет.',503);
  return {kind:'complete',reply,source:turn,reviewReceipt};
}
