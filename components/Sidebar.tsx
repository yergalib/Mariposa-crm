import Link from "next/link";

const items = [
  ["/", "⌂", "Главная"],
  ["/orders", "▣", "Заказы"],
  ["/calendar", "◫", "Календарь"],
  ["/products", "◇", "Товары"],
  ["/warehouse", "▤", "Склад"],
  ["/customers", "◎", "Клиенты"],
  ["/finance", "₸", "Финансы"],
  ["/whatsapp", "◌", "WhatsApp"],
  ["/settings", "⚙", "Настройки"]
] as const;

export function Sidebar({ active = "/" }: { active?: string }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div><b>MARIPOSA</b><span>CRM</span></div>
      </div>
      <nav>
        {items.map(([href, icon, label]) => (
          <Link key={href} href={href} className={`nav-item ${active === href ? "active" : ""}`}>
            <span className="nav-icon">{icon}</span><span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer"><span className="avatar">Д</span><div><b>Директор</b><small>MARIPOSA Astana</small></div></div>
    </aside>
  );
}
