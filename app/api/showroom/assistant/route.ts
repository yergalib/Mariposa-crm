import { ownerTestPolicy } from "@/lib/assistant/chat/owner-test";
import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { assertAssistantStaff } from "@/lib/assistant/chat/access";
import { AssistantError, CHAT_LIMITS, enterProcessLimit, untilAborted } from "@/lib/assistant/chat/limits";
import { runAssistantConversation, CONSULTATION_LIMITS } from "@/lib/assistant/chat/consultation";
import { openAIProvider, type ChatProvider } from "@/lib/assistant/chat/provider";
import { createCrmTools } from "@/lib/assistant/chat/tools";
import { boundedJson, pressureLimit, reply } from "@/lib/showroom/http";
import { ShowroomError } from "@/lib/showroom/service";
import type { AssistantDiagnostic } from "@/lib/assistant/chat/diagnostics";
import type { UsageSummary } from '@/lib/assistant/chat/usage-summary';
import { assertProviderTurnBudget } from '@/lib/assistant/chat/provider-budget';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {continuationRepository} from '@/lib/assistant/chat/continuation-store';
import {prepareContinuation,finishContinuation} from '@/lib/assistant/chat/review-continuation';
import {recordTurn,reviewRecordedTurn} from '@/lib/assistant/chat/recorded-turn';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
import { allowRequestTiming, timed, withRequestTiming, oncePerReadRequest } from '@/lib/showroom/request-timing';
export async function POST(request: Request) { return withRequestTiming(()=>handlePost(request)); }
async function handlePost(request: Request) {
  let release: (() => void) | undefined;
  let ownerEvaluation = false, modelAttempts = 0, modelInvocations = 0;
  const started = Date.now(), verifiedUsage: UsageSummary[] = [];
  const diagnostics: AssistantDiagnostic[] = [];
  const diagnostic = (event: AssistantDiagnostic) => {
    if (!ownerEvaluation) return;
    if (event.stage==='provider' && event.outcome==='reserved') modelAttempts++;
    if (diagnostics.length<32) diagnostics.push(event);
    console.info('mariposa_assistant_diagnostic',JSON.stringify(event));
  };
  const evaluation = () => ownerEvaluation ? { providerAttempts: modelAttempts, diagnostics, verifiedUsage, unknownUsageAttempts: modelAttempts - diagnostics.filter(e=>e.stage==='provider'&&e.outcome==='verified').length, elapsedMs: Date.now() - started } : undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_LIMITS.timeoutMs);
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AssistantError("Откройте помощник на странице витрины.", 403);
    const session = await timed("session", () => untilAborted(() => oncePerReadRequest("session", getCurrentSession), controller.signal));
    assertAssistantStaff(session);
    ownerEvaluation = session.role === 'OWNER';
    const OWNER_TEST = ownerTestPolicy();
    if (!await timed("permission", () => untilAborted(() => oncePerReadRequest("catalog_permission", () => hasPermission(session, "CATALOG_VIEW")), controller.signal))) throw new AssistantError("Недостаточно прав сотрудника.", 403);
    allowRequestTiming();
    pressureLimit("read");
    const input = await untilAborted(() => boundedJson(request, 12000), controller.signal);
    let phase:'planning'|'review'='planning';
    const tools = () => timed("setup", () => untilAborted(() => createCrmTools(session), controller.signal));
    const provider: ChatProvider = { async create(body, signal) {
      if (modelInvocations === 0 && phase==='planning') await assertProviderTurnBudget({ organizationId: session.organizationId, membershipId: session.membershipId });
      if(phase==='review' && modelInvocations!==0)throw new AssistantError('Повторная проверка не разрешена.',429);
      if (++modelInvocations > CONSULTATION_LIMITS.modelCalls) throw new AssistantError("Лимит обращений к модели в этом ходе исчерпан.", 429);
      release = enterProcessLimit(session.membershipId, Date.now(), { minute: OWNER_TEST.minuteCalls, hour: OWNER_TEST.calls });
      try { const result = await openAIProvider({organizationId:session.organizationId,membershipId:session.membershipId},{deadlineAt:started+CHAT_LIMITS.timeoutMs,diagnostic,checkpointOnly:phase==='planning'&&!!request.headers.get('x-assistant-turn')}).create(body, signal); if (result.usage) verifiedUsage.push(result.usage); return result; } finally { release?.(); release = undefined; }
    } };
    const key=request.headers.get('x-assistant-turn');
    if(key){
      z.string().uuid().parse(key);
      const repo=await continuationRepository();
      const resume=z.object({resumeKey:z.string().uuid()}).strict().safeParse(input);
      const result=resume.success?await(async()=>{
        if(resume.data.resumeKey!==key)throw new AssistantError('Неверный ключ продолжения.',409);
        const existing=await repo.findKey(key);
        if(!existing)return {status:'pending' as const,id:key}; // Never restart planning after an uncertain POST.
        phase='review';
        const completed=await finishContinuation(repo,existing.id,async candidate=>reviewRecordedTurn(candidate,provider,await tools(),controller.signal,diagnostic));
        if(existing.state==='complete'&&completed.status==='complete')return {...completed,result:await reviewRecordedTurn(completed.result,provider,await tools(),controller.signal,diagnostic)};
        return completed;
      })():await prepareContinuation(repo,key,createHash('sha256').update(JSON.stringify(input)).digest('hex'),async()=>recordTurn(input,provider,await tools(),controller.signal,diagnostic));
      if(result.status==='complete'){
        if(result.result.kind!=='complete')throw new AssistantError('Результат проверки не подтверждён.',503);
        return reply({...result.result.reply,evaluation:evaluation()});
      }
      return reply({continuation:{status:result.status,key},evaluation:evaluation()},result.status==='pending'?202:409);
    }
    const result = await runAssistantConversation(input, provider, await tools(), controller.signal, diagnostic);
    return reply({ ...result, evaluation: evaluation() });
  } catch (error) {
    if (error instanceof AssistantError || error instanceof ShowroomError) return reply({ error: error.message, evaluation: evaluation() }, error.status,error instanceof ShowroomError?error.retryAfter:3600);
    // Never expose provider diagnostics, credentials, messages or database errors.
    return reply({ error: "Помощник временно недоступен. Автоматического повтора нет; каталог продолжает работать." }, 503);
  } finally { clearTimeout(timer); release?.(); }
}
