import { getCurrentSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/effective";
import { assertAssistantStaff } from "@/lib/assistant/chat/access";
import { AssistantError, CHAT_LIMITS, enterProcessLimit, untilAborted } from "@/lib/assistant/chat/limits";
import { runConversation } from "@/lib/assistant/chat/engine";
import { openAIProvider } from "@/lib/assistant/chat/provider";
import { createCrmTools } from "@/lib/assistant/chat/tools";
import { boundedJson, reply } from "@/lib/showroom/http";
import { ShowroomError } from "@/lib/showroom/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_LIMITS.timeoutMs);
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AssistantError("Откройте помощник на странице витрины.", 403);
    const session = await untilAborted(getCurrentSession, controller.signal);
    assertAssistantStaff(session);
    if (!await untilAborted(() => hasPermission(session, "CATALOG_VIEW"), controller.signal)) throw new AssistantError("Недостаточно прав сотрудника.", 403);
    release = enterProcessLimit(session.membershipId);
    const input = await untilAborted(() => boundedJson(request, 12000), controller.signal);
    const tools = await untilAborted(() => createCrmTools(session), controller.signal);
    return reply(await runConversation(input, openAIProvider(), tools, controller.signal));
  } catch (error) {
    if (error instanceof AssistantError || error instanceof ShowroomError) return reply({ error: error.message }, error.status);
    // Never expose provider diagnostics, credentials, messages or database errors.
    return reply({ error: "Помощник временно недоступен. Автоматического повтора нет; каталог продолжает работать." }, 503);
  } finally { clearTimeout(timer); release?.(); }
}
