export const DASHBOARD_STATUS_LABELS:Record<string,string>={
  READY:"Готово",PREPARE:"К подготовке",RENTED:"В аренде",OVERDUE:"Просрочено",
  "Готово":"Готово","К подготовке":"К подготовке","В аренде":"В аренде"
};
export function dashboardStatusLabel(value:string){return DASHBOARD_STATUS_LABELS[value]??"Требует проверки"}

export const ORDER_STATUS_LABELS:Record<string,string>={
  DRAFT:"Черновик",PENDING_CONFIRMATION:"Ожидает подтверждения",RESERVED:"Зарезервирован",
  CONFIRMED:"Подтверждён",READY:"Готов к выдаче",IN_PROGRESS:"В аренде",
  COMPLETED:"Завершён",CANCELLED:"Отменён",NO_SHOW:"Клиент не пришёл",EXPIRED:"Истёк"
};
export function orderStatusLabel(value:string){return ORDER_STATUS_LABELS[value]??"Статус требует проверки"}
export function orderStatusTone(value:string):"neutral"|"info"|"success"|"warning"|"danger"|"accent"{
  if(["COMPLETED"].includes(value))return"success";if(["CANCELLED","NO_SHOW","EXPIRED"].includes(value))return"danger";
  if(["CONFIRMED","READY"].includes(value))return"success";if(["IN_PROGRESS"].includes(value))return"warning";
  if(["RESERVED","PENDING_CONFIRMATION"].includes(value))return"info";return"neutral";
}
export const ORDER_CHANNEL_LABELS:Record<string,string>={CRM:"В магазине",PHONE:"Телефон",WHATSAPP:"WhatsApp",INSTAGRAM:"Instagram",WEBSITE:"Сайт",OTHER:"Другое",IMPORT:"Импорт",API:"Интеграция"};
export function orderChannelLabel(value:string){return ORDER_CHANNEL_LABELS[value]??"Источник не указан"}
export const ORDER_TYPE_LABELS:Record<string,string>={RENTAL:"Аренда",SALE:"Продажа"};
export function orderTypeLabel(value:string){return ORDER_TYPE_LABELS[value]??"Тип требует проверки"}
export const TRACKING_MODE_LABELS:Record<string,string>={BULK:"Количественный учёт",SERIALIZED:"Поэкземплярный учёт"};
export function trackingModeLabel(value:string){return TRACKING_MODE_LABELS[value]??"Режим учёта требует проверки"}
export const OPERATIONAL_STATUS_LABELS:Record<string,string>={AVAILABLE:"Доступен",RESERVED:"Зарезервирован",RENTED:"Выдан",CLEANING:"На чистке",REPAIR:"В ремонте",LOST:"Утрачен",WRITTEN_OFF:"Списан"};
export function operationalStatusLabel(value:string){return OPERATIONAL_STATUS_LABELS[value]??"Состояние требует проверки"}
export const INSPECTION_LABELS:Record<string,string>={GOOD:"Хорошее состояние",NEEDS_CLEANING:"Нужна чистка",DAMAGED:"Повреждение"};
export function inspectionLabel(value:string|null|undefined){return value?INSPECTION_LABELS[value]??"Результат осмотра требует проверки":"Осмотр не указан"}
export const ORDER_EVENT_LABELS:Record<string,string>={CREATED:"Заказ создан",UPDATED:"Заказ изменён",ITEM_ADDED:"Позиция добавлена",ITEM_UPDATED:"Позиция изменена",ITEM_REMOVED:"Позиция удалена",RESERVED:"Товары зарезервированы",CONFIRMED:"Бронь подтверждена",CANCELLED:"Заказ отменён",READY:"Заказ подготовлен",ISSUED:"Товары выданы",RETURNED:"Возврат принят",COMPLETED:"Заказ завершён"};
export function orderEventLabel(value:string){return ORDER_EVENT_LABELS[value]??"Событие заказа"}

export const DASHBOARD_WARNING_LABELS:Record<string,string>={
  CROSS_CONTEXT_REVERSAL:"Исправление связано с другим заказом или клиентом.",
  FINANCE_CONTEXT_MISMATCH:"Контекст финансовых операций не согласован.",
  NEGATIVE_DEPOSIT:"Обнаружен отрицательный баланс залога.",
  FUTURE_FINANCIAL_TRANSACTION:"Есть финансовая операция с будущей датой.",
  RETURN_DATE_MISMATCH:"Плановые даты возврата не совпадают.",
  MAINTENANCE_CONTEXT_MISSING:"Статус обслуживания не подтверждён записью обслуживания.",
  PHYSICAL_PROVENANCE_MISMATCH:"Физическое движение не связано с заказом."
};
