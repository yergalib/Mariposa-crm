import 'server-only';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { OWNER_TEST } from './owner-test';
import { AssistantError } from './limits';
const reject=()=>new AssistantError('Ответ или расход модели не подтверждён. Личный тест остановлен.',502);
export function ownerRequest(raw:ResponseCreateParamsNonStreaming){
  const serialized=JSON.stringify(raw),body=JSON.parse(serialized) as ResponseCreateParamsNonStreaming;
  const format=body.text?.format;
  if(format?.type!=='json_schema')throw new AssistantError('Требуется ограниченный формат ответа.',413);
  const review=format.name==='conversation_boundary_review';
  const bytes=Buffer.byteLength(serialized,'utf8'),outputCap=review?OWNER_TEST.reviewOutput:OWNER_TEST.planningOutput,inputEstimate=review?OWNER_TEST.reviewInputEstimate:OWNER_TEST.planningInputEstimate;
  const fields=['model','store','service_tier','reasoning','max_output_tokens','tools','parallel_tool_calls','tool_choice','instructions','input','text'];
  if(Object.keys(body).some(key=>!fields.includes(key))||body.model!==OWNER_TEST.model||body.store!==false||body.service_tier!=='default'||body.parallel_tool_calls!==false||body.reasoning?.effort!=='none'||body.reasoning?.mode!=='standard'
    ||!['conversation_boundary_review','consultant_reply'].includes(format.name)||format.strict!==true
    ||!Array.isArray(body.tools)||body.tools.some(tool=>tool.type!=='function')||(review&&body.tools.length!==0)
    ||!Number.isSafeInteger(body.max_output_tokens)||body.max_output_tokens!<1||body.max_output_tokens!>outputCap||bytes>(review?OWNER_TEST.reviewBytes:OWNER_TEST.planningBytes))throw new AssistantError('Запрос выходит за границы личного теста.',413);
  return {body,bytes,inputEstimate,outputCap:body.max_output_tokens!};
}
export function verifiedOwnerUsage(response:unknown,policy:ReturnType<typeof ownerRequest>){
  const r=response as {status?:unknown;model?:unknown;service_tier?:unknown;usage?:{input_tokens?:number;output_tokens?:number;total_tokens?:number;input_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number};output_tokens_details?:{reasoning_tokens?:number}}};
  const u=r?.usage,integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
  if(r?.status!=='completed'||r.model!==OWNER_TEST.model||r.service_tier!=='default'||!u
    ||!integer(u.input_tokens,1,policy.inputEstimate)||!integer(u.output_tokens,0,policy.outputCap)||u.total_tokens!==u.input_tokens!+u.output_tokens!
    ||!integer(u.input_tokens_details?.cached_tokens,0,u.input_tokens!)
    ||!integer(u.input_tokens_details?.cache_write_tokens,0,u.input_tokens!)
    ||u.input_tokens_details!.cached_tokens!+u.input_tokens_details!.cache_write_tokens!>u.input_tokens!
    ||!integer(u.output_tokens_details?.reasoning_tokens,0,u.output_tokens!))throw reject();
  // Responses usage includes both cache categories within input_tokens, not on top
  // of it. Require the documented breakdown; missing/null counts are unknown.
  // The fixed reservation already prices ALL input at the higher cache-write rate.
  // Do not add cache tokens again, discount the reservation, or refund attempts.
  return u.output_tokens!;
}
