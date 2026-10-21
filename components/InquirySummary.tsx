import { STATUS_LABELS } from "@/lib/inquiries/validation";
import { formatBusinessDateTime } from "@/lib/calendar/timezone";

const statusHelp: Record<keyof typeof STATUS_LABELS, string> = {
  NEW: "Ожидает обработки",
  IN_PROGRESS: "Обращение обрабатывается",
  SELECTION: "Подбираем изделия",
  FITTING: "Этап примерки — проверьте запись и время",
  WAITING_CUSTOMER: "Ожидаем ответ клиента",
  ORDER: "Заказ оформлен из обращения",
  CLOSED: "Обработка обращения завершена",
};

type Props = {
  status: keyof typeof STATUS_LABELS;
  createdAt: Date;
  timezone: string;
  assignedTo: { status?: string; user: { displayName: string } } | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  compact?: boolean;
};

export function InquirySummary({ status, createdAt, timezone, assignedTo, nextAction, nextActionAt, compact = false }: Props) {
  return <div className={`inquiry-summary${compact ? " inquiry-summary-compact" : ""}`}>
    <div className="inquiry-status-row">
      <strong className="inquiry-status" data-status={status}>{STATUS_LABELS[status]}</strong>
      <span>{statusHelp[status]}</span>
    </div>
    <p className="inquiry-received">Поступило <time dateTime={createdAt.toISOString()}>{formatBusinessDateTime(createdAt, timezone)}</time> · время филиала</p>
    {!compact && <dl className="inquiry-work-facts">
      <div><dt>Ответственный</dt><dd>{assignedTo ? <>{assignedTo.user.displayName}{assignedTo.status && assignedTo.status !== "ACTIVE" ? " (неактивен)" : ""}</> : "Не назначен"}</dd></div>
      <div><dt>Следующий шаг</dt><dd>{nextAction || "Не задан"}</dd></div>
      <div><dt>Срок следующего шага</dt><dd>{nextActionAt ? formatBusinessDateTime(nextActionAt, timezone) : "Не назначен"}</dd></div>
    </dl>}
  </div>;
}

export function InquiryWorkSummary({ status, timezone, assignedTo, nextAction, nextActionAt }: Pick<Props, "status" | "timezone" | "assignedTo" | "nextAction" | "nextActionAt">) {
  const overdue = nextActionAt && nextActionAt < new Date() && !["CLOSED", "ORDER"].includes(status);
  if (!assignedTo && !nextAction && !nextActionAt) return <p className="inquiry-work-empty">Не назначены: ответственный и шаг.</p>;
  return <div className="inquiry-work-compact">
    <p><strong>Ответственный:</strong> {assignedTo ? assignedTo.user.displayName : "Не назначен"}{assignedTo?.status && assignedTo.status !== "ACTIVE" ? " (неактивен)" : ""}</p>
    {nextAction && <p><strong>Следующий шаг:</strong> {nextAction}</p>}
    {nextActionAt && <p className={overdue ? "inquiry-overdue" : undefined}><strong>{overdue ? "Просрочено:" : "Срок:"}</strong> {formatBusinessDateTime(nextActionAt, timezone)} · время филиала</p>}
  </div>;
}
