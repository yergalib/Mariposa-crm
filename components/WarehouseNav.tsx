import Link from "next/link";

const sections = [
  ["/warehouse", "Остатки"],
  ["/warehouse/receipts", "Приход"],
  ["/warehouse/transfers", "Перемещения"],
  ["/warehouse/write-offs", "Списания"],
  ["/warehouse/stocktakes", "Инвентаризация"],
  ["/warehouse/movements", "История"],
] as const;

export function WarehouseNav({ active }: { active: string }) {
  return <nav className="toolbar warehouse-nav" aria-label="Разделы склада">
    {sections.map(([href, label]) => <Link key={href} href={href}
      className={`button${active === href ? "" : " secondary"}`}
      aria-current={active === href ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
