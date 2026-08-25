import { Sidebar } from "./Sidebar";
import { requireRouteAccess } from "@/lib/auth/session";

export async function AppShell({ active = "/", title, subtitle, children, action }: { active?: string; title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  const session = await requireRouteAccess(active);

  return (
    <div className="app-shell">
      <Sidebar active={active} session={session} />
      <main className="main">
        <header className="topbar"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</header>
        {children}
      </main>
    </div>
  );
}
