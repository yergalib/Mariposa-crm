import "server-only";
import type { AuthContext } from "@/lib/auth/session";
import { PILOT_ORGANIZATION_ID } from "@/lib/tenant/pilot-preview";
import { AssistantError } from "./limits";
export function assistantConfigured() {
  return Number(process.versions.node.split(".")[0]) >= 22 && process.env.MARIPOSA_ASSISTANT_ENABLED === "1" && process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "review/pilot-preview-rollout"
    && process.env.STOREFRONT_ORGANIZATION_ID === PILOT_ORGANIZATION_ID && Boolean(process.env.OPENAI_API_KEY);
}
export function assertAssistantStaff(session: AuthContext | null): asserts session is AuthContext {
  if (!session) throw new AssistantError("Для теста войдите как сотрудник PILOT.", 401);
  if (session.organizationId !== PILOT_ORGANIZATION_ID || session.expiresAt <= new Date()) throw new AssistantError("Доступ разрешён только действующим сотрудникам PILOT.", 403);
  if (!assistantConfigured()) throw new AssistantError("Разговорный помощник пока не подключён. Каталог доступен ниже.", 503);
}
