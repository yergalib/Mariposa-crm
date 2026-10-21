import 'server-only';
import { publicBrowse, publicCategories } from '@/lib/showroom/service';
import { categoryTree } from '@/lib/showroom/categories';
import type { BrowseFilters, PublicBrowseCard } from '@/lib/showroom/contracts';
import { ProductRecommendations } from './ProductRecommendations';

// Optional recommendations must not block the selected product or calculate unused availability.
export async function RelatedProducts({ productId, filters }: { productId: string; filters: BrowseFilters }) {
  let result: { other: PublicBrowseCard[]; complements: PublicBrowseCard[] };
  try {
    const roots = categoryTree(await publicCategories());
    const dress = roots.find(node => /\u043f\u043b\u0430\u0442\u044c/iu.test(node.label));
    const additions = roots.filter(node => /\u043e\u0431\u0443\u0432|\u0430\u043a\u0441\u0435\u0441\u0441\u0443\u0430\u0440/iu.test(node.label)).slice(0, 2);
    const sample = async (key: string, accessory = false) => publicBrowse({ ...filters, from: '', until: '', search: '', categoryId: key, page: 1,
      ...(accessory ? { size: '', colorGroup: '' } : {}) }).then(value => value.items.filter(item => item.productId !== productId).slice(0, 4)).catch(() => []);
    const [other, complements] = await Promise.all([dress ? sample(dress.key) : Promise.resolve([]), Promise.all(additions.map(node => sample(node.key, true))).then(groups => groups.flat().slice(0, 4))]);
    result = { other, complements };
  } catch { return null; }
  return <ProductRecommendations {...result} filters={filters} />;
}
