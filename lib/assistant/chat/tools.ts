import "server-only";
import { z } from "zod";
import type { AuthContext } from "@/lib/auth/session";
import type { FunctionTool } from "openai/resources/responses/responses";
import { publicBranches, publicCatalog, publicSelection, ShowroomError } from "@/lib/showroom/service";
import { searchInput, selectionInput } from "@/lib/showroom/contracts";
import type { ChatCard } from "./contracts";
import { AssistantError } from "./limits";
const text = { type: "string" };
function tool(name: string, description: string, properties: Record<string, unknown>): FunctionTool {
  return { type: "function", name, description, strict: true, parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } };
}
export const crmToolDefinitions: FunctionTool[] = [
  tool("list_branches", "List published branches allowed for this PILOT staff member. No staff/contact data.", {}),
  tool("find_dresses", "Find published rental variants by confirmed exact size, colour and explicit local dates. Never broaden colour without explicit user consent. All fields required; empty search/colour means no restriction. No write operation.", { branchId: text, size: text, color: text, from: text, until: text, search: text }),
  tool("check_variant", "Recheck an exact variant returned by find_dresses in this turn. No reservation.", { branchId: text, variantId: text, from: text, until: text })
];
export interface CrmToolRunner { cards: Map<string, ChatCard>; searched: boolean; execute(name: string, raw: unknown): Promise<unknown> }
export async function createCrmTools(session: AuthContext): Promise<CrmToolRunner> {
  const branches = (await publicBranches()).filter(branch => session.hasOrganizationWideBranchAccess || session.allowedBranchIds.includes(branch.id));
  const allowed = new Set(branches.map(branch => branch.id));
  const runner: CrmToolRunner = { cards: new Map(), searched: false, async execute(name, raw) {
    try {
      if (name === "list_branches") { z.object({}).strict().parse(raw); return branches; }
      if (name === "find_dresses") {
        const input = searchInput.omit({ page: true }).extend({ size: z.string().trim().min(1).max(40) }).parse(raw);
        if (!allowed.has(input.branchId)) throw new AssistantError("Филиал недоступен сотруднику.", 403);
        runner.cards.clear(); runner.searched = false;
        const found = await publicCatalog({ ...input, page: 1 });
        for (const group of found.items.slice(0, 5)) {
          const item = group.variants[0];
          if (item) runner.cards.set(item.id, { productId: group.productId, executionId: group.executionId, item, branchId: input.branchId, from: input.from, until: input.until });
        }
        runner.searched = true;
        return { appliedColor: found.appliedColor ?? null, more: found.more || found.items.length > 5, products: [...runner.cards.values()].map(card => ({ variantId: card.item.id, name: card.item.name, size: card.item.size, execution: card.item.execution, available: card.item.available, priceKnown: card.item.price !== null })) };
      }
      if (name === "check_variant") {
        const input = selectionInput.parse(raw), known = runner.cards.get(input.variantId);
        if (!known || !allowed.has(input.branchId) || known.branchId !== input.branchId || known.from !== input.from || known.until !== input.until) throw new AssistantError("Сначала выполните подбор по этим условиям.");
        const item = await publicSelection(input);
        runner.cards.set(item.id, { ...known, item });
        return { variantId: item.id, available: item.available, priceKnown: item.price !== null };
      }
      throw new AssistantError("Инструмент не разрешён.");
    } catch (error) {
      if (error instanceof z.ZodError) return { error: "Уточните точный размер, филиал, цвет и даты в формате YYYY-MM-DDTHH:mm. Возраст не заменяет размер." };
      if (error instanceof ShowroomError) return { error: error.message };
      throw error;
    }
  } };
  return runner;
}
