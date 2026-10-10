import { resolveColorRequest } from "./colors";
import type { SelectionCriteria } from "./selection";
import type { PublicProductGroup, PublicVariant } from "@/lib/showroom/contracts";
export type SelectionBrief = { wishes: string; age: string; color: string; occasion: string; budget: string };
export function readSelectionBrief(form: Pick<FormData, "get">): { criteria: SelectionCriteria; brief: SelectionBrief } {
  const value = (name: string) => String(form.get(name) ?? "").trim();
  const resolved = resolveColorRequest(value("color"), value("search"), value("wishes"));
  return { criteria: { branchId: value("branchId"), size: value("size"), from: value("from"), until: value("until"), search: resolved.search, color: resolved.color },
    brief: { wishes: value("wishes"), age: value("age"), color: value("color"), occasion: value("occasion"), budget: value("budget") } };
}
export function briefForStaff(brief: SelectionBrief) {
  const entries = [["Пожелания", brief.wishes], ["Возраст (не размер)", brief.age], ["Цвет / исполнение", brief.color], ["Повод", brief.occasion], ["Бюджет на образ, KZT (не подтверждён)", brief.budget]];
  const lines = entries.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  return lines.length ? "Пожелания клиента; требуют уточнения сотрудником.\n" + lines.join("\n") : "";
}
export function selectionShortlist(groups: PublicProductGroup[]): PublicVariant[] {
  // One real size option per model/execution; do not score unsupported wishes.
  return groups.flatMap(group => group.variants[0] ? [group.variants[0]] : []).slice(0, 5);
}
