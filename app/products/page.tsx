import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { products } from "@/lib/mock-data";

export default function ProductsPage() {
  return (
    <AppShell active="/products" title="Товары" subtitle="Модели, размеры и физические экземпляры" action={<button className="primary">＋ Новый товар</button>}>
      <div className="toolbar"><input placeholder="Поиск по названию, модели, артикулу или штрихкоду"/><select><option>Все категории</option><option>Платья</option><option>Аксессуары</option></select></div>
      <section className="product-grid">
        {products.map(product => {
          const total = product.variants.reduce((s,v)=>s+v.instances.length,0);
          const available = product.variants.reduce((s,v)=>s+v.instances.filter(i=>i.status==="AVAILABLE").length,0);
          return <Link href={`/products/${product.id}`} key={product.id} className="product-card">
            <div className="photo-placeholder"><span>MARIPOSA</span><small>Фото модели</small></div>
            <div className="product-body"><div className="product-title"><div><h2>{product.name}</h2><p>Модель {product.supplierModel} · {product.color}</p></div><span className="count">{total} шт.</span></div>
              <div className="size-chips">{product.variants.map(v=><span key={v.size}>{v.size}</span>)}</div>
              <div className="stock-line"><span>Свободно сейчас</span><b>{available} из {total}</b></div>
            </div>
          </Link>
        })}
      </section>
    </AppShell>
  );
}
