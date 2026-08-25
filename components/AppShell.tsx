import { Sidebar } from "./Sidebar";

export function AppShell({ active, title, subtitle, children, action }: { active?: string; title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar active={active} />
      <main className="main">
        <header className="topbar"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</header>
        {children}
      </main>
    </div>
  );
}
