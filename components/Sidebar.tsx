import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { allowedNavigationPaths, ROLE_LABELS } from "@/lib/auth/access";
import type { AuthContext } from "@/lib/auth/session";

const items = [
  ["/", "⌂", "Главная"],
  ["/orders", "▣", "Заказы"],
  ["/returns", "↩", "Возвраты"],
  ["/calendar", "◫", "Календарь"],
  ["/products", "◇", "Товары"],
  ["/warehouse", "▤", "Склад"],
  ["/customers", "◎", "Клиенты"],
  ["/finance", "₸", "Финансы"],
  ["/whatsapp", "◌", "WhatsApp"],
  ["/settings", "⚙", "Настройки"]
] as const;

export function Sidebar({ active = "/", session }: { active?: string; session: AuthContext }) {
  const allowedPaths = allowedNavigationPaths(session.role);
  const initial = session.displayName.trim().charAt(0).toUpperCase() || "С";

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div><b>MARIPOSA</b><span>CRM</span></div>
      </div>
      <nav>
        {items.filter(([href]) => allowedPaths.has(href)).map(([href, icon, label]) => (
          <Link key={href} href={href} className={`nav-item ${active === href ? "active" : ""}`}>
            <span className="nav-icon">{icon}</span><span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="avatar">{initial}</span>
        <div className="sidebar-user">
          <b>{session.displayName}</b>
          <small>{ROLE_LABELS[session.role]} · {session.defaultBranchName ?? session.organizationName}</small>
        </div>
        <form action={logoutAction}>
          <button className="logout-button" type="submit" title="Выйти" aria-label="Выйти">↪</button>
        </form>
      </div>
    </aside>
  );
}
