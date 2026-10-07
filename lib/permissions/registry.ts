import type { AppRole } from "@/lib/auth/access";

export const PERMISSION_REGISTRY = {
NOTIFICATIONS_VIEW_ALL:["STAFF","Уведомления по работе других сотрудников"],
TASK_VIEW_ALL:["STAFF","Просмотр задач других сотрудников"],
SHIFT_VIEW_ALL:["STAFF","Просмотр смен других сотрудников"],
PAYROLL_VIEW:["FINANCE","Просмотр зарплатного учёта"],
PAYROLL_RATE_MANAGE:["FINANCE","Изменение ставок сотрудников"],
PAYROLL_CONFIRM:["FINANCE","Подтверждение смены и выданной выплаты"],
PAYROLL_REJECT:["FINANCE","Отклонение отметки смены"],
PAYROLL_BONUS:["FINANCE","Начисление премии"],
PAYROLL_PAYOUT:["FINANCE","Запись отдельной выплаты сотруднику"],
PAYROLL_REVERSE:["FINANCE","Исправление зарплатной записи"],
SETTINGS_GLOBAL_MANAGE:["STAFF","Общие настройки, создание и отключение филиалов, способы оплаты"],
DOCUMENT_SETTINGS_VIEW:["STAFF","Просмотр реквизитов документов"],
DOCUMENT_SETTINGS_MANAGE:["STAFF","Изменение реквизитов документов"],
  ORDER_ASSIGN:["ORDERS","Назначение ответственного за заказ"],FITTING_ASSIGN:["ORDERS","Назначение примерки другому сотруднику"],
  ORDER_PRICE_OVERRIDE:["ORDERS","Изменение цены заказа"],ORDER_DISCOUNT_MANAGE:["ORDERS","Изменение скидки заказа"],SETTINGS_VIEW:["STAFF","Просмотр настроек организации"],SETTINGS_MANAGE:["STAFF","Изменение настроек организации"],FITTING_VIEW:["ORDERS","Просмотр примерок"],FITTING_MANAGE:["ORDERS","Запись и обработка примерок"],
  CATALOG_VIEW:["CATALOG","Просмотр каталога"],CATALOG_IMPORT:["CATALOG","Импорт новых товаров"],CATALOG_CREATE:["CATALOG","Создание товаров"],CATALOG_EDIT:["CATALOG","Редактирование каталога"],CATALOG_ARCHIVE:["CATALOG","Архивация товаров"],CATALOG_PHOTO_MANAGE:["CATALOG","Управление фотографиями"],CATALOG_PURCHASE_COST_VIEW:["CATALOG","Просмотр закупочной стоимости"],
  CUSTOMER_VIEW:["CUSTOMERS","Просмотр клиентов"],CUSTOMER_CREATE:["CUSTOMERS","Создание клиентов"],CUSTOMER_EDIT:["CUSTOMERS","Редактирование клиентов"],CUSTOMER_ARCHIVE:["CUSTOMERS","Архивация клиентов"],CUSTOMER_IMPORT:["CUSTOMERS","Импорт клиентов"],CUSTOMER_EXPORT:["CUSTOMERS","Экспорт клиентов"],
  LEAD_VIEW:["LEADS","Просмотр обращений"],LEAD_CREATE:["LEADS","Создание обращений"],LEAD_EDIT:["LEADS","Работа с обращениями"],LEAD_ASSIGN:["LEADS","Назначение ответственного"],LEAD_CLOSE:["LEADS","Закрытие обращений"],LEAD_CONVERT_TO_ORDER:["LEADS","Преобразование обращения в заказ"],
  ORDER_VIEW:["ORDERS","Просмотр заказов"],ORDER_EXPORT:["ORDERS","Экспорт заказов"],ORDER_CREATE:["ORDERS","Создание заказов"],ORDER_EDIT:["ORDERS","Редактирование заказов"],ORDER_CANCEL:["ORDERS","Отмена заказов"],
  RENTAL_RESERVE:["RENTALS","Бронирование"],RENTAL_CONFIRM:["RENTALS","Подтверждение брони"],RENTAL_PREPARE:["RENTALS","Подготовка заказа"],RENTAL_ISSUE:["RENTALS","Выдача аренды"],
  SALE_CONFIRM:["ORDERS","Подтверждение продажи"],SALE_FULFILL:["ORDERS","Передача проданного товара"],
  RETURN_PROCESS:["RETURNS","Приём возврата"],RETURN_INSPECT:["RETURNS","Осмотр возврата"],MAINTENANCE_COMPLETE:["RETURNS","Завершение чистки и ремонта"],
  INVENTORY_VIEW:["INVENTORY","Просмотр склада"],INVENTORY_EXPORT:["INVENTORY","Экспорт остатков"],INVENTORY_RECEIVE:["INVENTORY","Приёмка товара"],INVENTORY_TRANSFER:["INVENTORY","Перемещение товара"],INVENTORY_ADJUST:["INVENTORY","Корректировка остатков"],INVENTORY_WRITE_OFF:["INVENTORY","Списание и потери"],
  STOCKTAKE_VIEW:["STOCKTAKE","Просмотр инвентаризаций"],STOCKTAKE_COUNT:["STOCKTAKE","Проведение подсчёта"],STOCKTAKE_RECONCILE:["STOCKTAKE","Сверка инвентаризации"],
  STAFF_VIEW:["STAFF","Просмотр сотрудников"],STAFF_INVITE:["STAFF","Приглашение сотрудников"],STAFF_EDIT:["STAFF","Изменение сотрудников"],STAFF_DEACTIVATE:["STAFF","Отключение сотрудников"],STAFF_PERMISSION_MANAGE:["STAFF","Управление наборами и индивидуальными правами"],
  PAYMENT_VIEW:["FINANCE","Просмотр платежей"],PAYMENT_CREATE:["FINANCE","Создание платежей"],PAYMENT_REFUND:["FINANCE","Возврат платежей"],PAYMENT_REVERSE:["FINANCE","Исправление ошибочной операции"],DEPOSIT_VIEW:["FINANCE","Просмотр залогов"],DEPOSIT_MANAGE:["FINANCE","Приём залогов"],DEPOSIT_REFUND:["FINANCE","Возврат залогов"],DEPOSIT_WITHHOLD:["FINANCE","Удержание залога за ущерб"],DAMAGE_ASSESS:["FINANCE","Финансовая оценка ущерба"],CUSTOMER_BALANCE_VIEW:["FINANCE","Просмотр задолженности клиента"],AUDIT_LOG_VIEW:["STAFF","Просмотр журнала действий"],FINANCE_DASHBOARD_VIEW:["FINANCE","Финансовая панель"],FINANCE_PURCHASE_COST_VIEW:["FINANCE","Закупочная стоимость"],FINANCE_MARGIN_VIEW:["FINANCE","Маржинальность"],SUPPLIER_VIEW:["PURCHASES","Просмотр поставщиков"],SUPPLIER_MANAGE:["PURCHASES","Управление поставщиками"],PURCHASE_VIEW:["PURCHASES","Просмотр закупок"],PURCHASE_CREATE:["PURCHASES","Создание закупок"],PURCHASE_EDIT:["PURCHASES","Редактирование закупок"],PURCHASE_CANCEL:["PURCHASES","Отмена закупок"],PURCHASE_RECEIVE:["PURCHASES","Приёмка закупки"],REPORT_FINANCE_VIEW:["REPORTS","Финансовые отчёты"],
  TASK_VIEW:["STAFF","Просмотр задач"],TASK_MANAGE:["STAFF","Создание и изменение задач"],TASK_STATUS:["STAFF","Изменение статуса задач"],
  SHIFT_VIEW:["STAFF","Просмотр плановых смен"],SHIFT_MANAGE:["STAFF","Назначение плановых смен"],
} as const;
export type PermissionKey=keyof typeof PERMISSION_REGISTRY;export type PermissionCategory=typeof PERMISSION_REGISTRY[PermissionKey][0];
export const PERMISSION_CATEGORY_LABELS:Record<PermissionCategory,string>={CATALOG:"Товары",CUSTOMERS:"Клиенты",LEADS:"Обращения",ORDERS:"Заказы",RENTALS:"Аренда",RETURNS:"Возвраты",INVENTORY:"Склад",STOCKTAKE:"Инвентаризация",STAFF:"Сотрудники",FINANCE:"Финансы",PURCHASES:"Закупки",REPORTS:"Отчёты"};
export const FUTURE_PERMISSION_CATEGORIES:ReadonlySet<PermissionCategory>=new Set([]);
const operational=["SHIFT_VIEW","PAYMENT_CREATE","TASK_VIEW","TASK_STATUS","FITTING_VIEW","FITTING_MANAGE","CATALOG_VIEW","CATALOG_PHOTO_MANAGE","CUSTOMER_VIEW","CUSTOMER_CREATE","CUSTOMER_EDIT","LEAD_VIEW","LEAD_CREATE","LEAD_EDIT","LEAD_CLOSE","LEAD_CONVERT_TO_ORDER","ORDER_VIEW","ORDER_CREATE","ORDER_EDIT","RENTAL_RESERVE","RENTAL_CONFIRM","RENTAL_PREPARE","RENTAL_ISSUE","RETURN_PROCESS","RETURN_INSPECT","MAINTENANCE_COMPLETE","INVENTORY_VIEW","INVENTORY_RECEIVE","STOCKTAKE_VIEW","STOCKTAKE_COUNT"]as const;
const director=[...operational,"NOTIFICATIONS_VIEW_ALL","TASK_VIEW_ALL","SHIFT_VIEW_ALL","PAYROLL_VIEW","PAYROLL_RATE_MANAGE","PAYROLL_CONFIRM","PAYROLL_REJECT","PAYROLL_BONUS","PAYROLL_PAYOUT","PAYROLL_REVERSE","SHIFT_MANAGE","TASK_MANAGE","ORDER_ASSIGN","FITTING_ASSIGN","ORDER_PRICE_OVERRIDE","ORDER_DISCOUNT_MANAGE","SETTINGS_VIEW","SETTINGS_MANAGE","LEAD_ASSIGN","CATALOG_CREATE","CATALOG_IMPORT","CATALOG_EDIT","CATALOG_ARCHIVE","CATALOG_PURCHASE_COST_VIEW","CUSTOMER_ARCHIVE","CUSTOMER_IMPORT","CUSTOMER_EXPORT","ORDER_EXPORT","ORDER_CANCEL","INVENTORY_EXPORT","INVENTORY_TRANSFER","INVENTORY_ADJUST","INVENTORY_WRITE_OFF","STOCKTAKE_RECONCILE","STAFF_VIEW","STAFF_INVITE","STAFF_EDIT","STAFF_DEACTIVATE","PAYMENT_VIEW","PAYMENT_CREATE","PAYMENT_REFUND","PAYMENT_REVERSE","DEPOSIT_VIEW","DEPOSIT_MANAGE","DEPOSIT_REFUND","DEPOSIT_WITHHOLD","DAMAGE_ASSESS","CUSTOMER_BALANCE_VIEW","FINANCE_DASHBOARD_VIEW","FINANCE_PURCHASE_COST_VIEW","FINANCE_MARGIN_VIEW","SUPPLIER_VIEW","SUPPLIER_MANAGE","PURCHASE_VIEW","PURCHASE_CREATE","PURCHASE_EDIT","PURCHASE_CANCEL","PURCHASE_RECEIVE","REPORT_FINANCE_VIEW"]as const;
export const ROLE_DEFAULT_PERMISSIONS:Record<AppRole,ReadonlySet<PermissionKey>>={OWNER:new Set(Object.keys(PERMISSION_REGISTRY)as PermissionKey[]),DIRECTOR:new Set(director),SELLER:new Set(operational),CASHIER:new Set(["SHIFT_VIEW","PAYMENT_CREATE","CATALOG_VIEW","CUSTOMER_VIEW","ORDER_VIEW","INVENTORY_VIEW","STOCKTAKE_VIEW"])};
export function isPermissionKey(value:string):value is PermissionKey{return Object.hasOwn(PERMISSION_REGISTRY,value)}
export function defaultHasPermission(role:AppRole,key:PermissionKey){return role==="OWNER"||ROLE_DEFAULT_PERMISSIONS[role].has(key)}
