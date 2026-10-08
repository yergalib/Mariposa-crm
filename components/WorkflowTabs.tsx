import Link from "next/link";

export function WorkflowTabs({ active, items }: { active: string; items: Array<{ href: string; label: string }> }) {
  return <nav className="workflow-tabs" aria-label="Разделы рабочего пространства">{items.map(item => <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined}>{item.label}</Link>)}</nav>;
}
