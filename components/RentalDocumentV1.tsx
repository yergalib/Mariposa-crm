import type { RentalSnapshot } from "@/lib/orders/document-snapshot";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";

// Keep this renderer for saved templateVersion=1; future layouts get a new renderer.
const outcomes: Record<string, string> = { GOOD: "Хорошее", NEEDS_CLEANING: "Нужна чистка", DAMAGED: "Повреждено", LOST: "Утрачено" };
export function RentalDocumentV1({ snapshot: s, version, reason }: { snapshot: RentalSnapshot; version: number; reason: string | null }) {
  const date = (value: string | null) => value ? formatBusinessDateTime(new Date(value), s.timezone) : "—";
  return <>
    <header><div><strong>MARIPOSA</strong><h1>Документ аренды · версия {version}</h1><p>Заказ {s.orderNumber} · {s.branchName}</p></div><span className="print-draft">Не подписан</span></header>
    <p className="print-notice">Снимок данных на {date(s.capturedAt)} ({s.timezone}). Это не подписанный и не юридически проверенный акт. Позднейшие изменения заказа здесь не отражаются.</p>
    <section className="print-facts">
      <div><small>Клиент</small><b>{s.customerName || "Не указан"}</b></div>
      <div><small>Период аренды</small><b>{date(s.rentalStartAt)}</b><span>До {date(s.rentalEndAt)}</span></div>
      <div><small>Филиал</small><b>{s.branchName}</b><span>Заказ: {s.orderStatusLabel}</span></div>
    </section>
    {reason && <p>Причина сохранения: {reason}</p>}
    <h2>Вещи по заказу</h2>
    <table><thead><tr><th>Наименование / SKU</th><th>Заказано</th><th>Выдано</th><th>Возвращено</th><th>Состояние / утраты</th></tr></thead><tbody>
      {s.items.map(item => <tr key={item.sourceItemId}>
        <td><b>{item.name} · {item.variant}</b><small>{item.sku} · {item.trackingMode === "BULK" ? "Количественный учёт" : "Поэкземплярный учёт"}</small>{item.removed && <small>Позиция удалена из заказа; сохранены факты передачи</small>}</td>
        <td>{item.quantity}</td>
        <td>{item.allocations.reduce((sum, row) => sum + row.issuedQuantity, 0)}</td>
        <td>{item.allocations.reduce((sum, row) => sum + row.returnedQuantity, 0)}</td>
        <td>{item.allocations.length ? item.allocations.map(a => <div key={a.sourceAllocationId}>
          {a.inventoryNumber && <b>№ {a.inventoryNumber}</b>}
          {a.issuedQuantity > 0 && <small>Выдано {a.issuedQuantity}: {date(a.issuedAt)}</small>}
          {a.returnedQuantity > 0 && <small>Возвращено {a.returnedQuantity}{a.returnedAt ? ` · завершено ${date(a.returnedAt)}` : " · частичный возврат"}</small>}
          {a.inspection && <small>{outcomes[a.inspection] ?? "Неизвестный результат осмотра"}{a.returnNote ? ` · ${a.returnNote}` : ""}</small>}
          {a.resolutions.map(r => <div key={r.sourceId}><small>{r.kind === "LOSS_RESOLUTION" ? "Утрата" : "Возврат"}: {date(r.occurredAt)}</small>{r.lines.map((line, index) => <small key={index}>{outcomes[line.outcome] ?? "Неизвестный результат осмотра"}: {line.quantity} шт.{line.note ? ` · ${line.note}` : ""}</small>)}</div>)}
          {!a.inspection && !a.resolutions.length && <small>Состояние не зафиксировано</small>}
        </div>) : "Передача не зафиксирована"}</td>
      </tr>)}
    </tbody></table>
    {!s.items.length && <p>Позиции отсутствуют.</p>}
    <footer><p>Сохранённая неподписанная версия. Причина сохранения и контрольная сумма не являются электронной подписью.</p><span>{s.orderNumber} · версия {version}</span></footer>
  </>;
}
