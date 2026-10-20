import { requireOwnerDaySession } from "@/lib/assistant/owner-day-access";
import { openAIProvider } from "@/lib/assistant/chat/provider";
import { assertAssistantStaff } from "@/lib/assistant/chat/access";
import { AssistantError } from "@/lib/assistant/chat/limits";
import { reply } from "@/lib/showroom/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Manual, once-only activation check; same durable 100-call/$2 allowance.
// No request body, catalogue/customer data, retries or automatic invocation.
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")
      throw new AssistantError("Откройте владельческий тест на сайте.", 403);
    const session = await requireOwnerDaySession();
    assertAssistantStaff(session);
    const result = await openAIProvider({ organizationId: session.organizationId, membershipId: session.membershipId, activationSmoke: true }).create({
      model: "gpt-6-luna", store: false, service_tier: "default", reasoning: { effort: "none", mode: "standard" },
      max_output_tokens: 64, instructions: "Return the JSON object with ok=true.", input: [{ role: "user", content: "Connection check." }],
      tools: [], parallel_tool_calls: false, tool_choice: "none",
      text: { format: { type: "json_schema", name: "consultant_reply", strict: true,
        schema: { type: "object", properties: { ok: { type: "boolean", enum: [true] } }, required: ["ok"], additionalProperties: false } } },
    }, AbortSignal.timeout(25000));
    if (result.status !== "completed" || JSON.stringify(JSON.parse(result.outputText)) !== '{"ok":true}')
      throw new AssistantError("Проверочный ответ не подтверждён. Вызов учтён, повтор запрещён.", 502);
    return reply({ ok: true, countedInDailyLimit: true });
  } catch (error) {
    return reply({ error: error instanceof AssistantError ? error.message : "Проверка не подтверждена. Автоматического повтора нет." }, error instanceof AssistantError ? error.status : 503);
  }
}
