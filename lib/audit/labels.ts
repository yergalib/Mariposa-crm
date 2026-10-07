export const AUDIT_ACTION_LABELS: Record<string, string> = {
  STAFF_ACCESS_UPDATED: "Изменён доступ сотрудника", STAFF_BRANCH_ACCESS_CHANGED: "Изменены филиалы сотрудника", BUSINESS_SETTING_CHANGED: "Изменена настройка",
  ORDER_ASSIGNEE_CHANGED: "Изменён ответственный заказа", ORDER_CHARGE_SYNCHRONIZED: "Обновлено начисление заказа", ORDER_DAMAGE_CHARGED: "Начислен ущерб", ORDER_DAMAGE_DEPOSIT_WITHHELD: "Удержан залог за ущерб", ORDER_DAMAGE_WAIVED: "Ущерб списан без оплаты", ORDER_DEPOSIT_REFUNDED: "Возвращён залог", ORDER_REQUIRED_DEPOSIT_CHANGED: "Изменён требуемый залог",
  PURCHASE_CREATED: "Создана закупка", PURCHASE_EDITED: "Изменена закупка", PURCHASE_CONFIRMED: "Подтверждена закупка", PURCHASE_CLOSED: "Завершена закупка", PURCHASE_CANCELLED: "Закупка отменена", PURCHASE_ITEM_ADDED: "Добавлена позиция закупки", PURCHASE_ITEM_EDITED: "Изменена позиция закупки", PURCHASE_ITEM_REMOVED: "Удалена позиция закупки", PURCHASE_RECEIPT_CREATED: "Принята закупка",
  SALE_DRAFT_CREATED: "Создан черновик продажи", SALE_CONFIRMED: "Подтверждена продажа", SALE_FULFILLED: "Товар передан покупателю", SALE_CANCELLED: "Продажа отменена", RENTAL_DOCUMENT_SAVED: "Сохранён документ аренды", FITTING_LINKED_TO_ORDER: "Примерка связана с заказом",
  BULK_RETURN_RECORDED: "Записан возврат товара", BULK_LOSS_RESOLVED: "Зафиксирована утрата", BULK_MAINTENANCE_COMPLETED: "Завершено обслуживание товара", BULK_MAINTENANCE_WRITTEN_OFF: "Товар списан после обслуживания", BULK_CLEANING_TRANSITIONED_TO_REPAIR: "Товар переведён в ремонт",
  SUPPLIER_CREATED: "Создан поставщик", SUPPLIER_EDITED: "Изменён поставщик", SUPPLIER_ARCHIVED: "Поставщик архивирован",
  SHIFT_CREATED: "Назначена смена", SHIFT_UPDATED: "Изменена смена", SHIFT_CANCELLED: "Отменена смена",
  TASK_CREATED: "Создана задача", TASK_UPDATED: "Изменена задача", TASK_STATUS_CHANGED: "Изменён статус задачи",
  FINANCIAL_TRANSACTION_POSTED: "Записана финансовая операция", FINANCIAL_TRANSACTION_REVERSED: "Отменена финансовая операция",
  CUSTOMER_CREATED: "Создан клиент", CUSTOMER_UPDATED: "Изменён клиент", CUSTOMER_ARCHIVED: "Клиент архивирован",
  ORDER_CREATED: "Создан заказ", ORDER_UPDATED: "Изменён заказ", ORDER_CANCELLED: "Заказ отменён",
  INQUIRY_CREATED: "Создано обращение", INQUIRY_UPDATED: "Изменено обращение", INQUIRY_SELECTION_UPDATED: "Обновлён подбор",
  SOURCE_CONVERTED_TO_ORDER: "Создан заказ из обращения", INQUIRY_FITTING_CREATED: "Создана примерка из обращения",
  FITTING_CREATED: "Создана примерка", FITTING_UPDATED: "Изменена примерка",
  MEMBERSHIP_UPDATED: "Изменены данные сотрудника", STAFF_PERMISSION_CHANGED: "Изменено разрешение сотрудника",
};
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  StaffShift: "Плановая смена", StaffTask: "Задача", Order: "Заказ", Customer: "Клиент", Inquiry: "Обращение", Fitting: "Примерка",
  Product: "Товар", ProductVariant: "Вариант товара", FinancialTransaction: "Финансовая операция",
  OrganizationMembership: "Сотрудник", Organization: "Организация", Branch: "Филиал", Location: "Место хранения",
};
export function auditActionLabel(action: string) { return AUDIT_ACTION_LABELS[action] ?? "Другое сохранённое действие"; }
export function auditEntityLabel(entity: string) { return AUDIT_ENTITY_LABELS[entity] ?? "Объект CRM"; }
