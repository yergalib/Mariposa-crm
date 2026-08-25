import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { products, statusLabel } from "@/lib/mock-data";
import { BarcodeClient } from "@/components/BarcodeClient";

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = products.find(p => p.id === id);
  if (!product) notFound();
  return (
    <AppShell active="/products" title={product.name} subtitle={`Модель ${product.supplierModel} · ${product.color}`} action={<button className="secondary">Редактировать</button>}>
      <section className="product-hero">
        <div className="hero-photo"><span>MARIPOSA</span><small>Здесь будет фото из object storage</small></div>
        <div className="hero-info"><span className="eyebrow">{product.category}</span><h2>{product.name}</h2><p>{product.description}</p><div className="meta-grid"><div><small>Модель поставщика</small><b>{product.supplierModel}</b></div><div><small>Цвет</small><b>{product.color}</b></div><div><small>Размеров</small><b>{product.variants.length}</b></div><div><small>Учёт</small><b>Поэкземплярный</b></div></div></div>
      </section>
      <section className="card variants-card"><div className="card-head"><div><h2>Размеры и остатки</h2><p>Каждая физическая единица имеет собственный штрихкод</p></div></div>
        <div className="variant-table">
          <div className="variant-row header"><span>Размер</span><span>Всего</span><span>Свободно</span><span>Бронь</span><span>В аренде</span><span>Химчистка</span><span>Ремонт</span></div>
          {product.variants.map(v => {
            const c=(s:string)=>v.instances.filter(i=>i.status===s).length;
            return <details key={v.size} className="variant-details"><summary className="variant-row"><b>{v.size}</b><span>{v.instances.length}</span><span>{c("AVAILABLE")}</span><span>{c("RESERVED")}</span><span>{c("RENTED")}</span><span>{c("CLEANING")}</span><span>{c("REPAIR")}</span></summary>
              <div className="instances-list">{v.instances.map(instance => <div className="instance-row" key={instance.id}><div><strong>{instance.id}</strong><small>SKU {v.sku} · размер {v.size}</small></div><BarcodeClient value={instance.barcode}/><span className={`badge ${instance.status.toLowerCase()}`}>{statusLabel(instance.status)}</span><button className="text-button">Открыть</button></div>)}</div>
            </details>
          })}
        </div>
      </section>
    </AppShell>
  );
}
