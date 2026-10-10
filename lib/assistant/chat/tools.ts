import "server-only";
import { z } from "zod";
import type { AuthContext } from "@/lib/auth/session";
import type { FunctionTool } from "openai/resources/responses/responses";
import { publicBranches, publicCategories, publicCatalog, publicProduct, publicSelection, publicSelectedCard, ShowroomError } from "@/lib/showroom/service";
import { searchInput, selectionInput, productInput } from "@/lib/showroom/contracts";
import { rentalSteps } from "@/app/showroom/site-content";
import type { ChatCard } from "./contracts";
import type { PublicBranch, PublicCategory, PublicProductDetail } from "@/lib/showroom/contracts";
import { AssistantError } from "./limits";
const text = { type: "string" };
function tool(name: string, description: string, properties: Record<string, unknown>): FunctionTool {
  return { type: "function", name, description, strict: true, parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } };
}
export const crmToolDefinitions: FunctionTool[] = [
  tool("get_product", "Read a published model/execution. Returns public photos and size labels, no financial/internal fields.", { productId: text, executionId: text }),
  tool("get_rental_rules", "Read owner-approved rental steps; no invented legal terms.", {}),
  tool("get_price", "Recheck exact known variant price for the same branch/dates; null means ask staff.", { branchId: text, variantId: text, from: text, until: text }),
  tool("list_branches", "List published branches allowed for this PILOT staff member. No staff/contact data.", {}),
  tool("find_dresses", "Find published rental variants by confirmed exact size, colour and explicit local dates. Never broaden colour without explicit user consent. All fields required; empty search/colour means no restriction. No write operation.", { branchId: text, size: text, color: text, from: text, until: text, search: text }),
  tool("check_variant", "Recheck an exact variant returned by find_dresses in this turn. No reservation.", { branchId: text, variantId: text, from: text, until: text })
];
export type SearchToolResult = { error?: string; appliedColor?: string | null; more?: boolean; next?: { page: number; offset: number }; products?: ChatCard[] };
const pagedSearch = searchInput.extend({ offset: z.number().int().min(0).max(7).default(0) });
export interface CrmToolRunner { branches: PublicBranch[]; categories: PublicCategory[]; cards: Map<string, ChatCard>; searched: boolean;
  product(input: unknown): Promise<PublicProductDetail>;
  select(input: { branchId: string; variantId: string; from: string; until: string }): Promise<ChatCard & { categoryId: string | null }>;
  execute(name: string, raw: unknown): Promise<unknown> }
export async function createCrmTools(session: AuthContext): Promise<CrmToolRunner> {
  // Defend this shared boundary independently of the current staff-only route.
  if (session.organizationId !== process.env.STOREFRONT_ORGANIZATION_ID) throw new AssistantError("Каталог другого пространства недоступен.", 403);
  const [publishedBranches, categories] = await Promise.all([publicBranches(), publicCategories()]);
  const branches = publishedBranches.filter(branch => session.hasOrganizationWideBranchAccess || session.allowedBranchIds.includes(branch.id));
  const allowed = new Set(branches.map(branch => branch.id));
  const runner: CrmToolRunner = { branches, categories, cards: new Map(), searched: false,
    product: async input => { if (!branches.length) throw new AssistantError("Нет доступного публичного филиала.", 403); return publicProduct(productInput.parse(input)); },
    async select(input) {
      if (!allowed.has(input.branchId)) throw new AssistantError("Филиал недоступен.", 403);
      const card = await publicSelectedCard(selectionInput.parse(input));
      const product = await publicProduct({ productId: card.productId, executionId: card.executionId ?? "" });
      return { ...card, images: product.images, reasons: [`Размер в каталоге: ${card.item.size}`, card.item.available ? "CRM: доступно на выбранные даты" : "CRM: недоступно на выбранные даты"] };
    },
    async execute(name, raw) {
    try {
      if (name === "list_branches") { z.object({}).strict().parse(raw); return branches; }
      if (name === "get_rental_rules") { z.object({}).strict().parse(raw); return { steps: rentalSteps, confirmation: "Заявку, цену и наличие подтверждает сотрудник. Автоматическая бронь и оплата не выполняются." }; }
      if (name === "get_product") return runner.product(raw);
      if (name === "find_dresses") {
        runner.cards.clear(); runner.searched = false;
        const { offset, ...input } = pagedSearch.parse(raw);
        if (input.categoryId && !categories.some(category => category.id === input.categoryId)) throw new AssistantError("Категория недоступна.", 404);
        if (!allowed.has(input.branchId)) throw new AssistantError("Филиал недоступен сотруднику.", 403);
        const found = await publicCatalog(input);
        // Only rank this bounded CRM page; never claim a global/style recommendation.
        const ranked = found.items.map(group => ({ group, item: group.variants.find(item => item.available) ?? group.variants[0] }))
          .filter(row => row.item).sort((a, b) => Number(b.item.available) - Number(a.item.available));
        const cards: ChatCard[] = [];
        for (const { group, item } of ranked.slice(offset, offset + 3)) {
          const product = await publicProduct({ productId: group.productId, executionId: group.executionId ?? "" });
          cards.push({ productId: group.productId, executionId: group.executionId, item, images: product.images,
            reasons: [`Размер в каталоге: ${item.size}`, ...(found.appliedColor ? [`Цвет «${found.appliedColor}» подтверждён атрибутами CRM`] : []), item.available ? "CRM: доступно на выбранные даты" : "CRM: недоступно на выбранные даты"],
            branchId: input.branchId, from: input.from, until: input.until });
        }
        for (const card of cards) runner.cards.set(card.item.id, card);
        runner.searched = true;
        const next = offset + 3 < ranked.length ? { page: input.page, offset: offset + 3 } : found.more && input.page < 100 ? { page: input.page + 1, offset: 0 } : undefined;
        return { appliedColor: found.appliedColor ?? null, more: Boolean(next), next, products: cards } satisfies SearchToolResult;
      }
      if (name === "check_variant" || name === "get_price") {
        const input = selectionInput.parse(raw), known = runner.cards.get(input.variantId);
        if (!known || !allowed.has(input.branchId) || known.branchId !== input.branchId || known.from !== input.from || known.until !== input.until) throw new AssistantError("Сначала выполните подбор по этим условиям.");
        runner.cards.delete(input.variantId);
        const item = await publicSelection(input);
        runner.cards.set(item.id, { ...known, item });
        return { variantId: item.id, available: item.available, price: item.price };
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
