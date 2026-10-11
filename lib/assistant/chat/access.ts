import "server-only";
import type { AuthContext } from "@/lib/auth/session";
import { ownerTestConfig } from "./owner-test";
import { AssistantError } from "./limits";
export function assistantConfigured() {
  return Number(process.versions.node.split(".")[0]) >= 22 && Boolean(ownerTestConfig()) && Boolean(process.env.OPENAI_API_KEY);
}
export function assertAssistantStaff(session: AuthContext | null): asserts session is AuthContext {
  if (!session) throw new AssistantError("Для личного теста войдите в разрешённую учётную запись.", 401);
  const config = ownerTestConfig();
  if (!config || session.role !== "OWNER" || session.membershipId !== config.membershipId || session.organizationId !== config.organizationId || session.expiresAt <= new Date()) throw new AssistantError("Личный тест недоступен этой учётной записи или его время истекло.", 403);
  if (!assistantConfigured()) throw new AssistantError("Разговорный помощник пока не подключён. Каталог доступен ниже.", 503);
}
