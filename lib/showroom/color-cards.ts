import { colorGroups, resolveCatalogColor } from "./color-groups";
import type { PublicBrowseCard } from "./contracts";
// Bounded existing home catalogue sample; not a second catalogue or colour inference.
export function colorPhotoCards(items: PublicBrowseCard[]) {
  return colorGroups.filter(group => group.id !== "other").flatMap(group => {
    const item = items.find(item => item.images?.length && resolveCatalogColor(item.execution, item.color).group === group.id);
    return item ? [{ id: group.id, label: group.label, photo: item.images![0] }] : [];
  });
}
