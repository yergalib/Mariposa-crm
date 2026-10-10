import { colorGroups, resolveCatalogColor } from "./color-groups";
import type { PublicBrowseCard } from "./contracts";
// Shared deterministic resolver; unknown/mixed descriptors are not guessed.
export function colorPhotoCards(items: PublicBrowseCard[]) {
  return colorGroups.flatMap(group => {
    const item = items.find(item => item.images?.length && resolveCatalogColor(item.execution, item.color).confirmed && resolveCatalogColor(item.execution, item.color).group === group.id);
    return item ? [{ id: group.id, label: group.label, photo: item.images![0] }] : [];
  });
}

export type ColorPhotoCard = ReturnType<typeof colorPhotoCards>[number];
