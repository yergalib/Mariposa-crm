'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowseFilters, PublicBranch, PublicProductDetail, PublicVariant } from '@/lib/showroom/contracts';
import { formatCatalogMoney } from '@/lib/showroom/money';
import { browsePriceText } from '@/lib/showroom/prices';
import { defaultBranchId } from '@/lib/showroom/catalog-filters';
import { uniqueSizeVariant } from '@/lib/showroom/size-selection';
import { ProductGallery } from './ProductPhoto';
import { InquiryForm } from './InquiryForm';
import { useInquiryIntake } from './InquiryAccess';

export function PurchaseProductDetail({ product, branches, initialCriteria }: { product: PublicProductDetail; branches: PublicBranch[]; initialCriteria: BrowseFilters }) {
  const intakeOpen = useInquiryIntake();
  const [variantId, setVariantId] = useState(() => uniqueSizeVariant(product.options, initialCriteria.size ?? ''));
  const [branchId, setBranchId] = useState(() => defaultBranchId(branches, initialCriteria.branchId));
  const [checked, setChecked] = useState<PublicVariant | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [inquiry, setInquiry] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function invalidate() { request.current?.abort(); request.current = null; setChecked(null); setPending(false); setInquiry(false); setError(''); }
  async function check(event: FormEvent) {
    event.preventDefault(); if (request.current || !variantId || !branchId) return;
    const controller = new AbortController(); request.current = controller; setPending(true); setChecked(null); setError('');
    try {
      const response = await fetch('/api/showroom/purchase-selection?' + new URLSearchParams({ branchId, variantId }), { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (request.current !== controller || controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || 'Проверка покупки временно недоступна.');
      if (data.id !== variantId || typeof data.available !== 'boolean') throw new Error('Обновите карточку товара.');
      setChecked(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Проверка временно недоступна.'); }
    finally { if (request.current === controller) { request.current = null; setPending(false); } }
  }
  const option = product.options.find(o => o.id === variantId);
  const price = checked ? checked.price : product.priceBranchId === branchId ? option?.price : null;
  const canRequest = Boolean(checked?.available && checked.price && intakeOpen);
  return <section className="showroom-detail product-detail-ready purchase-detail"><ProductGallery key={product.id} images={product.images} />
    <div className="showroom-contact"><p className="purchase-label">Покупка · SALE</p><h1>{product.name}</h1>
      <p>{product.colorLabel ?? product.execution ?? product.color ?? 'Цвет не указан'}</p>
      <p className="product-price">{price ? formatCatalogMoney(price.amountMinor, price.currency) + ' · покупка' : !checked && product.priceBranchId !== branchId ? 'Проверьте цену в выбранном филиале' : checked || variantId ? 'Цена продажи не указана' : browsePriceText(product.priceSummary, 'purchase')}</p>
      <p className="site-muted">Одна вещь. Без дат аренды. Цена и наличие требуют подтверждения сотрудником.</p>
      {inquiry && checked ? <InquiryForm purpose="purchase" item={checked} filters={{ branchId, from: '', until: '', search: '', size: checked.size }} branchLabel={branches.find(b => b.id === branchId)?.name ?? ''} onNewSearch={invalidate} /> : <>
        <form onSubmit={check}><fieldset disabled={pending} className="product-options">
          <label>Размер<select name="variantId" required value={variantId} onChange={e => { invalidate(); setVariantId(e.target.value); }}><option value="" disabled>Выберите размер</option>{product.options.map(o => <option key={o.id} value={o.id}>{o.size}</option>)}</select></label>
          <label>Город / филиал<select name="branchId" required value={branchId} onChange={e => { invalidate(); setBranchId(e.target.value); }}><option value="" disabled>Выберите филиал</option>{branches.map(b => <option key={b.id} value={b.id}>{b.city} — {b.name}</option>)}</select></label>
          <button className="primary">{pending ? 'Проверяем…' : 'Проверить цену и наличие'}</button>
        </fieldset></form>
        {pending && <button onClick={invalidate}>Отменить проверку</button>}
        {checked && <p role="status" className={'showroom-availability availability-' + (checked.available ? 'yes' : 'no')}>{checked.available ? checked.price ? 'Доступно для покупки · подтвердит сотрудник' : 'Наличие есть · цена продажи требует уточнения' : 'Сейчас недоступно для покупки'}</p>}
        {checked && !checked.price && <p role="status">Цена продажи не указана в CRM. Заявка на покупку пока недоступна.</p>}
        {!checked && <p className="site-muted">Наличие выбранного размера ещё не проверено.</p>}
        {error && <p role="alert">{error}</p>}
        {!intakeOpen && <p role="status">Приём заявок через сайт сейчас закрыт.</p>}
        <button className="primary" disabled={!canRequest || pending} onClick={() => setInquiry(true)}>Оставить заявку на покупку</button>
        <p className="site-muted">Заявка поступит сотруднику. Онлайн-оплаты и автоматического списания товара нет.</p>
      </>}
    </div>
  </section>;
}
