import { AppShell } from "@/components/AppShell";
import Link from "next/link";

export default function Dashboard() {
  return (
    <AppShell active="/" title="Главная" subtitle="Операционная панель MARIPOSA">
      <section className="stats-grid">
        <article className="stat"><span>Сегодня</span><strong>124 000 ₸</strong><small>Выручка</small></article>
        <article className="stat"><span>Заказы</span><strong>18</strong><small>7 выдач · 6 возвратов</small></article>
        <article className="stat"><span>В аренде</span><strong>43</strong><small>физических экземпляра</small></article>
        <article className="stat warning"><span>Требует внимания</span><strong>5</strong><small>2 просрочки · 3 ремонта</small></article>
      </section>
      <section className="panel-grid">
        <article className="card"><div className="card-head"><div><h2>Ближайшие действия</h2><p>Сегодня и завтра</p></div></div>
          <div className="timeline-row"><b>17:00</b><div><strong>Выдача · Алия</strong><span>Белоснежка 120 · 0060.120.004</span></div><em className="badge reserved">Бронь</em></div>
          <div className="timeline-row"><b>18:30</b><div><strong>Возврат · Дана</strong><span>Аврора 110 · 0142.110.003</span></div><em className="badge rented">В аренде</em></div>
        </article>
        <article className="card"><div className="card-head"><div><h2>Быстрые действия</h2><p>Частые операции</p></div></div>
          <div className="quick-grid"><button>＋ Новый заказ</button><Link href="/products">◇ Найти товар</Link><button>▥ Сканировать</button><button>↺ Принять возврат</button></div>
        </article>
      </section>
    </AppShell>
  );
}
