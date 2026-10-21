import { reserveProviderCall, type ProviderScope } from "./provider-budget";
import "server-only";
import { ownerRequest, verifiedOwnerUsage } from "./owner-test-request";
import { ownerTestConfig } from "./owner-test";
import { AssistantError } from "./limits";
import OpenAI from "openai";
import { assertProviderStartTime, emitDiagnostic, type DiagnosticSink } from "./diagnostics";
import { usageSummary, type UsageSummary } from './usage-summary';
import type { ResponseCreateParamsNonStreaming, ResponseOutputItem } from "openai/resources/responses/responses";
export type ProviderResult = { status: string | null; output: ResponseOutputItem[]; outputText: string; outputTokens: number; usage?: UsageSummary };
export interface ChatProvider { create(body: ResponseCreateParamsNonStreaming, signal: AbortSignal): Promise<ProviderResult> }
export function openAIProvider(scope: ProviderScope, evaluation: { deadlineAt?: number; diagnostic?: DiagnosticSink } = {}): ChatProvider {
  // Explicit host, no browser client, automatic retries, provider logging or state storage.
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 25000, logLevel: "off" });
  return { async create(body, signal) {
    if(signal.aborted||!ownerTestConfig())throw new AssistantError('Личный тест не включён или завершён.',503);
    const policy=ownerRequest(body);
    const kind=policy.body.text?.format?.type==='json_schema' && policy.body.text.format.name==='conversation_boundary_review'?'review':'planning';
    assertProviderStartTime(evaluation.deadlineAt,kind,evaluation.diagnostic);
    const release=await reserveProviderCall(scope,policy.bytes,policy.outputCap);
    emitDiagnostic(evaluation.diagnostic,{stage:'provider',kind,outcome:'reserved'});
    const started=Date.now();
    let stage: 'request' | 'usage' | 'receipt' | 'settled' = 'request';
    try {
      if(signal.aborted||!ownerTestConfig())throw new AssistantError('Личный тест завершён до отправки запроса.',503);
      const response=await client.responses.create(policy.body,{signal});
      // A completed response received at the deadline still has billable evidence.
      // Persist verified usage before suppressing late UI output; never refund it.
      stage='usage';const outputTokens=verifiedOwnerUsage(response,policy);
      stage='receipt';await release(response);
      stage='settled';
      emitDiagnostic(evaluation.diagnostic,{stage:'provider',kind,outcome:'verified',elapsedMs:Date.now()-started});
      if(signal.aborted||!ownerTestConfig())throw new AssistantError('Время личного теста истекло. Продолжение остановлено.',503);
      return {status:response.status??null,output:response.output,outputText:response.output_text,outputTokens,usage:usageSummary(response,Date.now()-started)};
    } catch(error) {
      if(stage!=='settled')emitDiagnostic(evaluation.diagnostic,{stage:'provider',kind,outcome:stage==='request'?'request_unverified':stage==='usage'?'usage_rejected':'receipt_unconfirmed',elapsedMs:Date.now()-started});
      throw error;
    }
  } };
}
