import type { Prisma } from '../../generated/prisma/client';
// Data plan only: no database import, connection, credentials or write entrypoint.
// Apply through existing Prisma models in one transaction only after isolation approval.
const id = (n: number) => `a0172026-1017-4017-8017-${String(n).padStart(12, '0')}`;
export function syntheticSeed() {
  const organizationId = id(1), foreignOrganizationId = id(2), branchId = id(3), sizeId = id(4);
  const organizations = [
    { id: organizationId, name: 'SYNTHETIC Mariposa Preview', slug: 'synthetic-preview-20261017', timezone: 'Asia/Almaty' },
    { id: foreignOrganizationId, name: 'SYNTHETIC Foreign tenant', slug: 'synthetic-foreign-20261017', timezone: 'Asia/Almaty' }
  ] satisfies Prisma.OrganizationCreateManyInput[];
  const branches = [{ id: branchId, organizationId, code: 'SYN', name: 'SYNTHETIC Showroom', city: 'Synthetic', timezone: 'Asia/Almaty', isPublic: true }] satisfies Prisma.BranchCreateManyInput[];
  const sizes = [{ id: sizeId, organizationId, code: '140', name: '140' }, { id: id(5), organizationId: foreignOrganizationId, code: '140', name: '140' }] satisfies Prisma.SizeCreateManyInput[];
  const products = [
    { id: id(10), organizationId, name: 'SYNTHETIC White dress', color: 'Белый', showOnWebsite: true, internalCode: 'SYN-WHITE' },
    { id: id(11), organizationId, name: 'SYNTHETIC Blue dress', color: 'Синий', showOnWebsite: true, internalCode: 'SYN-BLUE' },
    { id: id(12), organizationId, name: 'SYNTHETIC Unpublished dress', color: 'Синий', showOnWebsite: false, internalCode: 'SYN-HIDDEN' },
    { id: id(13), organizationId: foreignOrganizationId, name: 'SYNTHETIC Foreign dress', color: 'Синий', showOnWebsite: true, internalCode: 'SYN-FOREIGN' }
  ].map(p => ({ ...p, publicationStatus: 'ACTIVE' as const, trackingMode: 'BULK' as const, isRentable: true, isSellable: false })) satisfies Prisma.ProductCreateManyInput[];
  const variants = products.map((p, i) => ({ id: id(20 + i), organizationId: p.organizationId, productId: p.id, sizeId: p.organizationId === organizationId ? sizeId : id(5), sku: p.internalCode })) satisfies Prisma.ProductVariantCreateManyInput[];
  const prices = variants.map((v, i) => ({ id: id(30 + i), organizationId: v.organizationId, productVariantId: v.id, type: 'RENTAL' as const, amountMinor: BigInt(i === 0 ? 18000 : 12000), currency: 'KZT', validFrom: new Date('2026-10-01T00:00:00Z') })) satisfies Prisma.ProductPriceCreateManyInput[];
  // No stock: catalogue comparison must not imply availability or reserve capacity.
  // Login/session creation is intentionally excluded from this data-only seed.
  return { syntheticOnly: true as const, organizations, branches, sizes, products, variants, prices };
}
