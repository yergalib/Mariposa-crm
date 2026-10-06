import Link from "next/link";
import type { getWarehouseSummary } from "@/lib/inventory/warehouse-summary";

type Row = Awaited<ReturnType<typeof getWarehouseSummary>>["bulk"][number];
const columns = ["Товар / Название", "Размер", "Всего", "На складе", "Резерв аренды сейчас", "В аренде", "Чистка", "Ремонт", "Филиал"];
export function WarehouseStockTable({ rows }: { rows: Row[] }) {
  return <div className="warehouse-table-wrap"><table className="warehouse-table">
    <caption className="warehouse-sr-only">Количества по варианту и филиалу</caption>
    <thead><tr>{columns.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>
      <td data-label={columns[0]} className="warehouse-name"><Link href={`/products/${row.productVariant.productId}`}><strong>{row.productVariant.product.name}</strong></Link><small>Код: {row.productVariant.sku}</small></td>
      <td data-label={columns[1]}>{row.productVariant.size.code}</td>
      <td data-label={columns[2]}>{row.activeFleet}</td>
      <td data-label={columns[3]}>{row.physicalOnHand}</td>
      <td data-label={columns[4]}>{row.plannedReservations}</td>
      <td data-label={columns[5]}>{row.issuedOutstanding}</td>
      <td data-label={columns[6]}>{row.unclassifiedMaintenance ? "Не уточнено" : row.cleaning}</td>
      <td data-label={columns[7]}>{row.unclassifiedMaintenance ? "Не уточнено" : row.repair}</td>
      <td data-label={columns[8]} className="warehouse-branch">{row.branch.name}</td>
    </tr>)}</tbody>
  </table></div>;
}
