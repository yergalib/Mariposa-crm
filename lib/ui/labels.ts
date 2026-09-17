export const DASHBOARD_STATUS_LABELS:Record<string,string>={
  READY:"Готово",PREPARE:"К подготовке",RENTED:"В аренде",OVERDUE:"Просрочено",
  "Готово":"Готово","К подготовке":"К подготовке","В аренде":"В аренде"
};
export function dashboardStatusLabel(value:string){return DASHBOARD_STATUS_LABELS[value]??"Требует проверки"}

export const DASHBOARD_WARNING_LABELS:Record<string,string>={
  CROSS_CONTEXT_REVERSAL:"Исправление связано с другим заказом или клиентом.",
  FINANCE_CONTEXT_MISMATCH:"Контекст финансовых операций не согласован.",
  NEGATIVE_DEPOSIT:"Обнаружен отрицательный баланс залога.",
  FUTURE_FINANCIAL_TRANSACTION:"Есть финансовая операция с будущей датой.",
  RETURN_DATE_MISMATCH:"Плановые даты возврата не совпадают.",
  MAINTENANCE_CONTEXT_MISSING:"Статус обслуживания не подтверждён записью обслуживания.",
  PHYSICAL_PROVENANCE_MISMATCH:"Физическое движение не связано с заказом."
};
