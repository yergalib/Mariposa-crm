import Link from 'next/link';
import type { BrowseFilters } from '@/lib/showroom/contracts';
import { browseHref } from '@/lib/showroom/navigation';

export function CatalogModeSwitch({ filters }: { filters: BrowseFilters }) {
  return <nav className="catalog-mode-switch" aria-label="Аренда или покупка">
    {(['rental', 'purchase'] as const).map(mode => <Link key={mode}
      className={(filters.mode ?? 'rental') === mode ? 'selected' : undefined}
      aria-current={(filters.mode ?? 'rental') === mode ? 'page' : undefined}
      href={browseHref({ ...filters, mode, page: 1, from: '', until: '' })}>
      {mode === 'rental' ? 'Аренда' : 'Покупка'}
    </Link>)}
  </nav>;
}
