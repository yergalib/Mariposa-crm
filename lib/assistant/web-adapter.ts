"use client";
import type { SelectionAdapter } from "./selection";

export const webSelectionAdapter: SelectionAdapter = {
  async findOptions(criteria, page) {
    const response = await fetch(`/api/showroom/catalog?${new URLSearchParams({ ...criteria, page: String(page) })}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Подбор временно недоступен. Попробуйте позже.");
    return data;
  }
};
