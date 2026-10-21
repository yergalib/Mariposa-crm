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
import type { UsageSummary } from '@/lib/assistant/chat/usage-summary';
import { assertProviderTurnBudget } from '@/lib/assistant/chat/provider-budget';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
import { allowRequestTiming, timed, withRequestTiming, oncePerReadRequest } from '@/lib/showroom/request-timing';
export async function POST(request: Request) { return withRequestTiming(()=>handlePost(request)); }
async function handlePost(request: Request) {
  let release: (() => void) | undefined;
  let ownerEvaluation = false, modelAttempts = 0;
  const started = Date.now(), verifiedUsage: UsageSummary[] = [];
  const evaluation = () => ownerEvaluation ? { providerAttempts: modelAttempts, verifiedUsage, unknownUsageAttempts: modelAttempts - verifiedUsage.length, elapsedMs: Date.now() - started } : undefined;
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
    const tools = await timed("setup", () => untilAborted(() => createCrmTools(session), controller.signal));
    const provider: ChatProvider = { async create(body, signal) {
      if (modelAttempts === 0) await assertProviderTurnBudget({ organizationId: session.organizationId, membershipId: session.membershipId });
      if (++modelAttempts > CONSULTATION_LIMITS.modelCalls) throw new AssistantError("Лимит обращений к модели в этом ходе исчерпан.", 429);
      release = enterProcessLimit(session.membershipId, Date.now(), { minute: OWNER_TEST.minuteCalls, hour: OWNER_TEST.calls });
      try { const result = await openAIProvider({organizationId:session.organizationId,membershipId:session.membershipId}).create(body, signal); if (result.usage) verifiedUsage.push(result.usage); return result; } finally { release?.(); release = undefined; }
    } };
    const result = await runAssistantConversation(input, provider, tools, controller.signal);
    return reply({ ...result, evaluation: evaluation() });
  } catch (error) {
    if (error instanceof AssistantError || error instanceof ShowroomError) return reply({ error: error.message, evaluation: evaluation() }, error.status,error instanceof ShowroomError?error.retryAfter:3600);
    // Never expose provider diagnostics, credentials, messages or database errors.
    return reply({ error: "Помощник временно недоступен. Автоматического повтора нет; каталог продолжает работать." }, 503);
  } finally { clearTimeout(timer); release?.(); }
}
