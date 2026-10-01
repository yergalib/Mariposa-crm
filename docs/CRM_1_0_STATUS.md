# CRM 1.0 — состояние и порядок завершения

Срез 01.10.2026, исходный код `0942471d28e8bb8efb82bc82f4df6ff5fcf930c9`,
изолированная ветка `review/crm-inquiry-reply-contact`. Первый завершённый локальный
блок: `b0d7aac87cb9405eb8c2aa5d64177c597c26c0c5` — обратный контакт ручных
обращений. Следующий локальный коммит `06e7733444d24cc65ace4621d5c80052041ee1e4`
закрывает explicit DENY в lookup и отдельное право удержания залога.
Этот документ актуализирует объём CRM из handoff пользователя, а не
объявляет готовность к эксплуатации. Исторические статусы master roadmap сохранены.

## Границы проверки

- **ACTUAL** — выполнено здесь с указанным доказательством. Для CODE это чтение
  реализации/локальные проверки; не равнозначно DATABASE, DEPLOYED или E2E.
- **NOTRUN** — здесь не выполнялось; наличие SQL или старого тестового скрипта
  не является подтверждением текущего состояния БД или прохождения сценария.
- **BLOCKED** — требуется отдельное разрешённое окружение/действие либо решение.
- DATABASE в этом проходе **NOTRUN**: соединений и запросов к реальной БД нет.
  По handoff уже применены schema документов, inquiry queue и public showroom,
  а каталог MAIN/PILOT содержит 330 товаров / 1052 варианта / 4915 единиц.
  Это сведения parent, а не повторная проверка. Старую запись о Prisma history
  gap нельзя автоматически считать актуальной; требуется read-only сверка.
- DEPLOYED для новых коммитов **BLOCKED**: локальная реализация не опубликована.
  Последний remote SHA `4882576` известен из handoff, remote здесь не запрашивался.
  Действующий отказ на публикацию сохраняется; другой worktree не обход отказа.
- DB/E2E ниже **NOTRUN / BLOCKED** до согласованного сценария и изолированной
  тестовой БД. PILOT snapshot не является автоматическим разрешением изменять
  его 4915 единиц или существующие 2 allocations. Нет финансовых операций,
  клиентских сообщений, cleanup, seed, reset, DDL, смены секретов или паролей.
- Сайт продолжает отдельный поток. Полная реализация AI остаётся **PAUSED** до
  одобрения визуального прототипа. Telegram stash и dirty checkout не затронуты.
- Принятые Stage8B / FOUNDATION-1D, включая iPhone BULK, не переписывать.

## Матрица CODE / DATABASE / DEPLOYED / E2E

В столбце DATABASE указаны файлы схемы для последующей сверки, не факт её применения.

| Направление | CODE: фактическая реализация и пробел | DATABASE | DEPLOYED | E2E |
| --- | --- | --- | --- | --- |
| 1. Финансы | ACTUAL, частично: `lib/finance/effects.ts`, `transactions.ts`, `order-payments.ts`, `order-deposits.ts`, `order-damage.ts`; actions заказов вызывают сервисы. Частичная оплата/доплата, возврат, залог и ущерб есть. `reverseFinancialTransaction` есть в сервисе/старых тестах, вызова из app не найдено. Новые штрафные правила не вводятся. | NOTRUN; `20260908120000_stage_9a_financial_foundation`, `20260914120000_stage_9h_a_reversal_integrity` | BLOCKED для изменений | NOTRUN; mock-эффекты и guards проверены отдельно ниже |
| 2. Финансовая сводка | ACTUAL, частично: `lib/dashboard/queries.ts` + `app/page.tsx` имеют today/7 days/month/last month/custom, branch scope, выручку, оплаты/возвраты, долг, залоги и принятые закупки из транзакций. Начисления продажи выделены локально в saleAccruedRevenue, UI и XLSX; AOV и количество завершённых продаж не реализованы. `/finance` — другая, ограниченная 30 днями сводка. | NOTRUN; FinancialTransaction, PurchaseReceiptLine | BLOCKED | NOTRUN |
| 3. Отчёты и выгрузки | ACTUAL, частично: XLSX routes клиентов, заказов, товаров, остатков, движений и финансов; `lib/catalog/economics.ts` — история/экономика модели и вариантов. На главной рейтинг 10 товаров lifetime, не выбранного периода. Отдельных полноценных отчётов utilization/idle, размеров, повреждений, закупок и AOV/продаж не найдено. | NOTRUN; existing order/stock/finance/receipt models | BLOCKED | NOTRUN; финансовый и каталог XLSX проверены локальным mock roundtrip, без реальной БД |
| 4. Документы | ACTUAL, частично: `lib/orders/documents.ts`, `document-snapshot.ts`, `app/orders/[id]/documents/*` — неизменяемые неподписанные версии; `/print` — рабочий лист выдачи/возврата только RENTAL. Sale и отдельный документ удержания не реализованы. Подписание не изобретать. | NOTRUN; `20260930150000_rental_document_versions`, applied по handoff | BLOCKED | NOTRUN; печать A4/многостраничность не принималась здесь |
| 5. Права и аудит | ACTUAL, частично: `lib/permissions/{registry,effective}.ts`, branch-access, audit log, per-action checks. Два небольших исправления описаны ниже. Branch scope каталога и granular finance visibility закрыты локально; см. отдельный раздел ниже. Общий security audit не выполнен. | NOTRUN; `stage_8d_a`, `stage_8e_a`, финансовые immutable/audit triggers | BLOCKED | NOTRUN; focused mock DENY regression ACTUAL |
| 6. Клиенты/обращения | ACTUAL, частично: контакты, normalizePhone/Email, обнаружение дублей с явным allowDuplicate, заметки, история заказов/оплат/залогов/сальдо. Список сохранённых документов клиента реализован локально: 20 версий на страницу, scope клиента/заказа/филиала, без финансовых полей. Inquiry не связан с Customer/Order; единого interaction timeline нет. Ручной replyContact завершён локально. | NOTRUN; `stage_5_customers`, `inquiry_queue`, `public_showroom`; последние applied по handoff | BLOCKED | NOTRUN; replyContact mock ACTUAL |
| 7. Календарь и доступность | ACTUAL: `lib/availability/capacity.ts`, `interval.ts`, `lib/inventory/capacity-lock.ts`, `lib/orders/management.ts`, returns/bulk-maintenance; tenant/branch/timezone, buffer, locks, peak capacity, maintenance/loss logic. Наличие общего сервиса не доказывает отсутствие double booking в реальной конкурентной БД. | NOTRUN; `stage_3_5a` exclusion constraint, BULK/Sale migrations | BLOCKED | NOTRUN; нужен race + boundary/late/partial regression |
| 8. Склад/штрихкоды | ACTUAL, принято ранее по handoff: `lib/inventory`, `lib/stocktake`, `lib/scanning`, warehouse actions. Закупка различает BULK ledger/stock и SERIALIZED instances; sale fulfillment создаёт SALE_ISSUE. Не перестраивать принятую основу. | NOTRUN; `stage_8a/8b`, BULK-1…4, sale integrity SQL | BLOCKED | NOTRUN в этом проходе; предыдущая приёмка не отменяется |
| 9. Фото | ACTUAL, pipeline: `lib/catalog/images.ts` загружает оригинал и производные; `image-renditions.ts`: catalog 480, site 1600, messaging 1280, сохранение пропорций. Import planner есть; исходные фото ожидаются. Список каталога локально переведён на catalog rendition с fallback; галерея detail сохраняет оригинальный signed URL. | NOTRUN; ProductImage + storage, файлы здесь не загружались | BLOCKED | NOTRUN; внешний Storage не вызывался |
| 10. WhatsApp | ACTUAL, внутренняя проверка модели/размера/периода, live availability, цены, фото, копирование ответа: `lib/whatsapp/inquiry.ts`, `app/whatsapp`. Канал/приём/доставка сообщений не подключены; информация магазина/канальные правила не завершены. Explicit DENY в lookup исправлен локально. | NOTRUN; использует каталог/availability | BLOCKED; credentials требуют отдельного разрешения | NOTRUN; mock permission regression ACTUAL |
| 11. Telegram / общее AI-ядро | ACTUAL, web foundation: `lib/assistant/{selection,brief,web-adapter}.ts`, `chat/*`; `chat/access.ts` требует PILOT/preview/env flags. Telegram routes в этом checkout нет; сторонний stash не трогать. Архитектура free entry / 3 ranked options / height guide / optional extras одобрена по handoff, full AI PAUSED. | NOTRUN; Inquiry foundation, нет общей Message/Conversation модели в schema | BLOCKED / PAUSED | NOTRUN; платных вызовов и сообщений нет |
| 12. Единый API | ACTUAL, частично: `/api/showroom/{catalog,selection,inquiries,assistant}`, общие бизнес-сервисы и staff server actions. Полного versioned staff API для customers/orders/reservations нет. Новый слой должен переиспользовать сервисы и проверять права, не дублировать availability/finance. | NOTRUN | BLOCKED | NOTRUN |
| 13. iPhone операции | ACTUAL, реализация: OrderForm, SaleOrderForm, operational selector, scan actions, rental/return/payment панели, stocktake. Принятую мобильную инвентаризацию сохранить; весь requested find→customer→pay→issue→return путь заново не принят здесь. | NOTRUN | BLOCKED | NOTRUN на устройстве; latency/камера не измерялись |
| 14. Сквозные циклы | ACTUAL, старые scripts: `orders-integration`, `stage-7c-e2e`, `stage-8c-e2e`, `sale-*`, purchase/damage scripts. Многие импортируют db/dotenv, создают/удаляют записи. Их наличие не означает PASS; запуск запрещён без отдельного безопасного target. | NOTRUN / BLOCKED | BLOCKED | NOTRUN / BLOCKED |
| 15. Безопасное окружение | ACTUAL: изолированный worktree, собственные копии зависимостей/generated client, без .env; build с `127.0.0.1:1`, пустыми Storage/API credentials. Исходные checkout не редактировались. | NOTRUN, ни одной реальной операции | BLOCKED | План ниже; scoped authority ещё не получена |
| 16. Выпуск | Код/сборка не закрывают release gate. Нужны все обязательные сценарии, отсутствие критичных mock-зависимостей в рабочем пути, money/stock coherence, permissions/audit/mobile и отдельный final release audit. | NOTRUN | BLOCKED | NOTRUN; CRM 1.0 не объявлена готовой |

## Финансовые инварианты: что проверено и что осталось

Прочитаны реализации и история Git; ядро уже существует, новый ledger не нужен.

1. `effectsFor` разделяет obligation/cash/revenue/deposit. Начисление увеличивает
   долг и выручку; платёж уменьшает долг и увеличивает cash; приём залога меняет
   cash/deposit, но не долг/выручку. Удержание уменьшает долг/deposit без новой
   выручки или движения денег. Для каждого вида проверено равенство
   `revenueEffect - obligationEffect = cashEffect - depositEffect`.
2. `acceptOrderPayment` разрешает CONFIRMED/COMPLETED, берёт finance lock,
   синхронизирует charge, проверяет сумму против outstanding. Повторный ключ
   сравнивает semantic payload. Уменьшение цены ниже netPaid отвергается.
   `cancelOrder` до отмены требует возвратить удерживаемый залог; target charge
   обнуляется через существующую синхронизацию и её проверку netPaid.
3. `issueOrder` и `fulfillSale` берут finance lock, проверяют подтверждённое
   состояние и требуют **ровно нулевой** obligation. Отрицательный баланс тоже
   блокирует выдачу. Депозит не заменяет оплату и не является обязательным gate.
4. Возврат оплаты привязан к исходному PAYMENT_RECEIVED и его payment method;
   возврат/удержание не должны превышать исходное доступное поступление.
   `withholdOrderDepositForDamage` ограничивает сумму held/outstanding/damage,
   использует `DEPOSIT_WITHHOLD`. Новый автоматический штраф не добавляется.
5. REVERSAL проверяет контекст, зависимости и противоположные effects;
   SQL содержит immutable history и provenance constraints. Реальная работа
   locks, rollback, triggers, повторов и конкуренции **NOTRUN**.
6. Сервис низкого уровня `withholdDeposit` ошибочно проверял DEPOSIT_MANAGE.
   Исправлен на DEPOSIT_WITHHOLD; тест проверяет DENY при разрешённом приёме
   залога и ALLOW при запрещённом приёме. Его вызовы в app не найдены — это
   защита общего сервиса, не новая кнопка финансовой операции.

### Закрытые локально ограничения чтения (01.10.2026)

- Каталог: `lib/catalog/read-scope.ts`, `queries.ts` требуют явный scope.
  Только `null` означает доступ ко всей организации; пустой/пропущенный список
  не возвращает остатки. List/detail, экземпляры, BULK quantities, management
  branches/locations ограничены доступными филиалами. Общие карточки/категории
  сохранены. Цена недоступного defaultBranch не попадает в DTO или XLSX:
  используется общая цена. Все app callers передают авторизованный scope;
  labels дополнительно проверяет CATALOG_VIEW и INVENTORY_VIEW.
- `/finance` и экспорт: `lib/finance/read-visibility.ts` применяет реальные
  effective permissions. PAYMENT_VIEW открывает payment/refund, DEPOSIT_VIEW —
  receipt/refund/withholding залога, FINANCE_MARGIN_VIEW — charge/discount.
  REVERSAL виден только для разрешённого исходного вида внутри организации.
  CUSTOMER_BALANCE_VIEW отдельно управляет obligationEffect; запрет поля
  исключает его из DTO, SELECT/aggregate и колонок XLSX/итогов.
  Фильтр видов применяется до суммирования. Cash относится только к видимым
  payment/deposit операциям; подписи явно ограничивают область итогов.
  Это изменение за период, а не полное сальдо. Все виды запрещены — пустая
  панель без запроса журнала и 403 экспорта.
- Базовые права входа не изменены: FINANCE_DASHBOARD_VIEW для панели,
  REPORT_FINANCE_VIEW для XLSX. OWNER сохраняет существующий инвариант resolver
  (все права); DIRECTOR получает штатный набор с индивидуальными DENY;
  SELLER/CASHIER финансового доступа по умолчанию не имеют, явные ALLOW работают.
  Новых разрешений, расширения ролей, схемы или финансовых записей нет.
- `scripts/crm-read-scope-mock.cjs`: 8/8 ACTUAL, реальные query/services/routes,
  resolver и XLSX roundtrip. Два филиала, foreign tenant, empty/undefined scope,
  роли/ALLOW/DENY, REVERSAL, фильтры, цена fallback, отсутствие полей/строк в
  DTO/XLSX, суммы, UTC dates, literal text и лимит экспорта. БД полностью mock.

### Выявленные оставшиеся риски

- Два подтверждённых P1 выше закрыты в локальном коде и mock-проверках.
  DATABASE/DEPLOYED/E2E остаются NOTRUN/BLOCKED; это не общий security audit.
- **P2, отчётные даты:** экспорт `/finance` использует UTC-day, явно подписывает
  UTC; главная использует timezone организации, операционные страницы — филиала.
  Для бизнес-отчётов по филиалу нужно единое правило периода, особенно границы дня.
- **P2, неполные функции:** correction service без app workflow; отдельные sale
  KPI/AOV и practical reports; документы продажи/удержания
  и interaction context. Эти пробелы не блокируются ожиданием workbook/фото.
- Полное security/E2E отложено пользователем до финала; этот проход — targeted
  checks и triage. ПД/размещение/правила подписания остаются отдельными решениями.

## Локальные проверки

- `node scripts/inquiry-reply-contact-mock.cjs`: ACTUAL, 14/14 сценариев.
  Реальные validation/service/server action/form, in-memory DB и allowlist
  зависимостей. Создание/изменение/очистка, сохранение при omitted field,
  нормализация, идемпотентность, конфликт version, права/tenant/branch, аудит.
- `node scripts/crm-permission-invariants-mock.cjs`: ACTUAL, 6/6 сценариев.
  Реальные resolver прав и сервисы; explicit catalog/inventory DENY раньше
  воспроизводил отсутствие отказа, после изменения блокирует до чтения данных.
  Также проверены право удержания, ledger effects, раздельные deposit/payment
  и guards выдачи. Ни один настоящий финансовый transaction не исполняется.
- `tsc --noEmit --incremental false` и `next build`: ACTUAL, PASS также после
  branch scope и financial field visibility. Финальная сборка: 43/43 static pages,
  staff routes динамические; использован фиктивный DB URL `127.0.0.1:1`.
- Focused ESLint текущего этапа: ACTUAL, 0 errors; 4 существующих предупреждения
  `no-img-element` на страницах каталога. `git diff --check`: ACTUAL, PASS.
- Timezone regression: ACTUAL, 14/14; payment display regression: ACTUAL, 11/11.
  Использован существующий `test-runtime-preload.cjs` для ошибки Windows
  `uv_os_get_passwd ENOMEM`. Никаких real DB imports у этих двух скриптов нет.
- Все перечисленные PASS относятся к локальным проверкам; не к DB/E2E.

## Последовательность независимых этапов

### Read-only gap analysis после ограничения чтения

- **ЗАКРЫТО ЛОКАЛЬНО, P2:** заменена заглушка «Документы» в
  `app/customers/[id]/page.tsx` списком уже сохранённых rental document versions (см. новый этап ниже).
  Использовать `lib/orders/documents.ts` и существующие order/document routes;
  обязательны CUSTOMER_VIEW, ORDER_VIEW и scope заказа/филиала. Только чтение,
  пагинация, ссылки на существующую версию/печать, пометка unsigned. Новая схема,
  правила подписания и создание финансовых документов не нужны. Mock: другой
  tenant/филиал, DENY, пустой список, несколько версий и неизменность snapshot.
- **Correction workflow, P1 перед release:** `reverseFinancialTransaction` в
  `lib/finance/transactions.ts` существует, вызовов из app не найдено. Нельзя
  просто добавить кнопку: reversal может затрагивать уже выданный заказ,
  возвраты, удержания и согласованность текущего charge. Сначала спецификация
  допустимых существующих transitions и idempotency/lock integration fixtures;
  никаких придуманных штрафов или автоматических возвратов.
- **Отчёты, P2:** `lib/dashboard/queries.ts` уже имеет периоды и branch scope,
  начисления продажи теперь выделены отдельно; top products используют lifetime economics.
  Разделение rental/sale в отчёте возможно без нового ledger; AOV, utilization,
  idle и отчёт закупок требуют точного определения периода и знаменателя.
- **Документы, P2:** `app/orders/[id]/print/page.tsx` допускает только RENTAL;
  отдельные документы продажи и удержания отсутствуют. Это следующий scope
  после списка существующих клиентских документов; не обещать юридическую
  подпись или менять принятый rental snapshot workflow.

Ни один из этих пробелов не требует цен workbook/фото, запуска AI или изменения
потока сайта. Gap analysis финансовых workflow остаётся read-only; список документов клиента реализован отдельным этапом ниже.

1. Права чтения каталога и финансовых полей закрыты локально; переносить этот
   этап только вместе с его mock regression, не считать его DB/E2E приёмкой.
2. Финансовый workflow: проверить реальные actions/read models против ядра,
   correction/refund/cancel replay и stock↔money границы; только существующие
   правила. Подготовить безопасные DB-интеграционные сценарии отдельно от запуска.
3. Расширить уже существующую сводку и отчёты: отдельная sale/rental аналитика,
   определённый denominator AOV, period/branch filters, XLSX; никаких fake KPI.
4. Документы из CRM без обещания подписи: продажа/удержание и доступ к уже
   сохранённым rental versions из клиента; затем оставшийся customer context.
5. Совместимость calendar/availability/BULK/serialized/mobile и общий API;
   фото — после исходников; каналы/AI — после website checkpoint и разрешений.
6. Согласовать точный E2E target, выполнить финальный набор и отдельный release
   audit. Не заменять финал зелёной сборкой, не обходить publication block.

## Завершение списка документов и следующий scope

### Этап: документы клиента, 01.10.2026

- CODE ACTUAL: `listCustomerRentalDocuments` в `lib/orders/documents.ts` и
  `app/customers/[id]/CustomerDocuments.tsx`, подключённый вместо заглушки.
  CUSTOMER_VIEW + ORDER_VIEW проверяются в сервисе и по текущему membership;
  используется существующая модель прав документов (отдельного DOCUMENT_VIEW нет).
  Организация, доступные активные филиалы и текущая связь заказа с клиентом
  ограничивают и список, и курсор. Документ и заказ проверяются по branch scope.
- Выборка только метаданных, без snapshot, revisionReason и финансовых полей.
  Ссылка ведёт на существующую сохранённую версию с просмотром/печатью;
  snapshot не создаётся и не меняется. Все версии обозначены неподписанными.
  Страница 20 записей + одна для nextCursor, порядок createdAt/id, без OFFSET
  и общего COUNT; чужой/устаревший курсор отклоняется без выдачи списка.
  Пустой список и отсутствие таблицы имеют отдельные состояния UI.
- DATABASE NOTRUN, DEPLOYED BLOCKED, browser/DB E2E NOTRUN. Нет миграций,
  реальных DB writes, финансовых операций, remote/push или изменений сайта.
- ACTUAL checks: `customer-documents-mock.cjs` 6/6 (реальные service/resolver,
  SSR компонента, in-memory DB с запретом writes); `crm-read-scope-mock.cjs` 8/8.
  TypeScript и build PASS (43/43 static pages), focused ESLint 0 errors/warnings.

### Следующий минимальный scope после документов

1. **ЗАКРЫТО ЛОКАЛЬНО, начисления продажи на главной:** `lib/dashboard/queries.ts:revenueFamily`
   уже возвращает SALE для корректных ORDER_CHARGE / SALE orders, включая
   DISCOUNT и REVERSAL по исходной операции. Ранее SALE суммировался в
   `otherRevenue`. Реализовано `saleAccruedRevenue` и отдельная строка
   рядом с арендой; сохранить текущий период/timezone, tenant/branch scope,
   FINANCE_DASHBOARD_VIEW + FINANCE_MARGIN_VIEW, раздельные валюты и ambiguous
   attribution. Это начисления, не оплаты и не количество завершённых продаж.
   Без AOV, новых правил признания дохода, схемы или записей. Mock fixtures:
   charge/discount/reversal, sale/rental/damage/ambiguous, период, валюты и DENY.
2. **P1 перед интерфейсом исправлений:** `transactions.ts:reverseFinancialTransaction`
   требует PAYMENT_REVERSE и причину, берёт advisory/order lock, проверяет
   tenant/branch/customer/currency, semantic idempotency, запрещает повторный
   reversal и ненулевые зависимые refund/withholding effects, создаёт обратные
   effects. `context` не читает status заказа; отдельного запрета исправления
   оплаты уже выданного заказа здесь нет. `order-payments.ts:refundOrderPayment`
   делегирует связанному refund, а `synchronizeOrderChargeWithClient` запрещает
   target ниже netPaid. `management.ts:cancelOrder` — отдельный workflow.
   До кнопки нужны согласованные допустимые переходы и проверка согласованности
   charge/полной оплаты после исправления. Автоматический штраф, возврат и
   разрешение задолженности после выдачи не выводятся из этих функций.

Отчёт реализован последующим локальным этапом ниже; correction workflow не менялся.

## Завершение отчётности по начислениям продажи

### Этап начислений продажи, 01.10.2026

- CODE ACTUAL: прежняя `revenueFamily` без изменения правил вынесена в
  `lib/finance/revenue-family.ts`; прежний экспорт из dashboard сохранён.
  Dashboard DTO добавляет `saleAccruedRevenue`; SALE исключён из otherRevenue,
  общий total/daily/comparison не менялся. Сумма частей по валюте равна total.
  UI показывает состав начислений; скидки и REVERSAL используют исходную
  классификацию и знаковые revenue effects, а не amountMinor/cash.
- `app/finance/export/route.ts`: в существующий лист «Итоги» добавлен только
  столбец «В том числе начисления продажи». Это подытог колонки «Начислено»;
  не новая сумма поверх total. REPORT_FINANCE_VIEW и FINANCE_MARGIN_VIEW,
  visibility по видам и scope филиалов сохранены; DENY убирает колонку.
  Порядок прежних колонок не изменён, новая добавлена последней. Дополнительные
  source/order/reversal metadata используются только для классификации внутри
  сервера; не выгружаются и не содержат новых финансовых значений.
- Главная использует прежний timezone организации и half-open период,
  XLSX — прежний явно обозначенный UTC. Разницу правил дат не маскировать:
  одинаковые текстовые даты в этих отчётах не означают одинаковые интервалы.
- ACTUAL: sale-report-mock 6/6 (реальный getDashboard, SSR UI, total partition,
  payment/refund/deposit separation, скидки/reversals, foreign tenant/branch,
  DENY, start/end, comparison и DST 23/25 часов). Read-scope/XLSX mock 9/9;
  customer-documents mock 6/6. Typecheck/build PASS (43/43 static pages),
  focused lint 0 errors/warnings. DATABASE/browser E2E NOTRUN, DEPLOYED BLOCKED;
  финансовых writes нет. REVERSAL учитывается по дате его собственной проводки,
  даже если исходное начисление продажи было до периода.

### Read-only пробелы отчётности и вопрос по correction

- `app/orders/export/route.ts`: принимает type=SALE, но from/until фильтруют
  rentalStartAt/rentalEndAt, не событие продажи. Это подтверждённый разрыв
  семантики отчёта продаж; не выбирать createdAt/confirmedAt/fulfilledAt за
  пользователя. Безопасный следующий scope — сделать смысл существующего
  периода явным в интерфейсе и не предлагать его как период продажи; затем
  отдельно определить нужное событие для нового фильтра.
- У закупок не найден export route. Экономика товаров остаётся lifetime,
  AOV/utilization/idle требуют определения знаменателя и периода. Пока только
  read-only анализ, без новых KPI и бизнес-правил.
- Один вопрос перед correction UI: **что делать с ошибочной оплатой после
  фактической выдачи — (A) разрешать reversal с явным долгом и аудитом,
  (B) разрешать только атомарную замену оплаты с сохранением нулевого долга,
  или (C) запретить в обычном интерфейсе до отдельной процедуры руководителя?**
  Вариант B требует нового согласованного workflow; ни один вариант здесь не
  реализован. Текущий invariant выдачи fully-paid не отвечает на этот вопрос.

## Завершение превью каталога и предложение контактов

### Этап превью каталога, 01.10.2026

- CODE ACTUAL: только imageUrl карточки списка в `lib/catalog/queries.ts`
  использует существующий `getSignedProductImageRenditionUrl(key, "catalog")`.
  Галерея detail по-прежнему использует оригиналы; сайт, upload, Storage helper,
  схема и исходные фото не менялись. При недоступном rendition helper возвращает
  оригинал, при отсутствии фото/Storage — null.
- `crm-read-scope-mock.cjs`: 10/10 ACTUAL, реальный queries + images helper,
  Storage только mock read methods. Проверены ключ, fallback missing/exists-error/
  sign-error, обе подписи недоступны, disconnected, no-image и foreign tenant.
  Один DB query на список, take=36, параллельность фото сохранена. Дополнительного
  DB N+1 нет; Storage имеет **2 вызова на фото вместо 1**, до 3 при ошибке подписи
  rendition и fallback. Это существующая стоимость helper, не скрытый batch.
- Typecheck/build/lint проверены локально; DATABASE/Storage/browser E2E NOTRUN,
  DEPLOYED BLOCKED. Никаких внешних запросов, перезагрузки фото или writes.

### Исходное предложение контактов (реализовано следующим этапом ниже)

1. Отдельно валидировать ввод перед нормализацией в create/add/edit и import:
   PHONE — отклонять буквы и произвольный мусор, сохранив существующую обработку
   +7/8/10 цифр, пробелов, скобок и дефисов, лимит 7–15 цифр; EMAIL — проверять
   синтаксис после trim, сохранив текущий lowercase. Не объявлять это проверкой
   существования номера/адреса. Правила международных префиксов и добавочных
   номеров не изобретать. В import показывать ошибку строки, не обрывать весь
   анализ из-за одного некорректного контакта. Поиск остаётся отдельным tolerant
   normalization path. Исторические записи не переписывать.
2. Конкурентные дубли: сейчас поиск выполняется до транзакции, индекс
   CustomerContact по organization/type/normalizedValue не уникальный. Предложение:
   transaction-scoped advisory locks по tenant/type/normalizedValue в стабильном
   порядке и повторная проверка внутри той же транзакции перед create/add/update;
   все пути, включая import, должны использовать один контракт. Сохранить
   allowDuplicate и excludeId, без уникального индекса, автослияния и cleanup.
   Существующая проверка до транзакции может оставаться только предварительной.
3. Проверки будущего scope: canonical equivalents, явный мусор, email, tenant,
   исключение текущего клиента, разрешённый дубль, ошибка строки импорта; mocks
   порядка lock/recheck/write. Реальную защиту от гонки подтвердить позже двумя
   конкурентными транзакциями исключительно на согласованной изолированной БД.

Scope контактов затем разрешён parent и реализован ниже. SALE dates и correction
по-прежнему pending; эти этапы их не меняют.

## Контакты клиентов: локальный этап и остановка для сводного ревью

- CODE ACTUAL: `contactSchema` отвергает буквенный мусор/повторный +/управляющие
  символы в телефоне и явно неверную структуру email до нормализации. Сохранены
  7–15 цифр и обычное форматирование, OTHER и allowDuplicate. Это минимальная
  синтаксическая проверка, не проверка существования адреса или номера.
- `normalizePhone` сохраняет явно международный +: прежняя логика могла
  заменить +81… на +71… или дописать 7 к международным десятизначным номерам.
  Без + сохранены прежние правила 8/7/десяти цифр. Импорт помечает ошибку строки
  и продолжает анализ; confirmation заново вызывает авторитетный create service.
- Runtime write paths проверены в app/lib: `createCustomer`, `addContact`,
  `updateContact` в `management.ts`; server actions вызывают эти сервисы,
  `confirmImport` вызывает createCustomer. Прямых SQL writes customer_contacts
  в app/lib не найдено. Fixture/admin scripts не запускались и не превращены в
  поддерживаемые рабочие пути; advisory locks не являются DB unique constraint.
- Создание берёт уникальные ключи tenant/type/normalizedValue в стабильном
  порядке, затем проверяет дубль и записывает. Add/update сначала берут owner
  lock клиента, чтобы сериализовать изменение контактов/primary; update повторно
  читает старый ключ после owner lock и берёт старый+новый ключи в том же порядке.
  Исключение своего клиента и разрешённые дубли сохранены. ReadCommitted задан
  явно, чтобы проверка после ожидания lock читала предшествующий commit.
- ACTUAL mocks: `customer-contact-validation-mock.cjs` 8/8 — international,
  мусор до DB, tenant keys, стабильный порядок/dedup locks, повторное чтение,
  duplicates/override/exclusion, import success и дубль после preview. Проверка
  порядка транзакции не доказывает реальную гонку PostgreSQL: concurrency E2E
  **NOTRUN**, остаётся обязательной будущей проверкой на изолированной БД.
- Регрессии replyContact 14/14, customer documents 6/6; typecheck/build PASS
  (43/43 static pages), focused lint 0 errors/warnings. DATABASE NOTRUN,
  DEPLOYED BLOCKED. Миграций, слияния, изменения индексов и live writes нет.
- Исторические значения не переписывались. Ранее ошибочно нормализованный
  международный номер может иметь старый ключ; полноту поиска таких дублей этот
  patch не гарантирует. Нужна отдельная разрешённая read-only сверка. Исправление
  старого невалидного контакта теперь требует допустимого нового значения.

Новые scopes остановлены для parent review. Цепочка после исходного 0942471:
b0d7aac (replyContact), 06e7733 (lookup/withholding permissions), 5bae031 (матрица),
e86b149 (branch/finance reads), d2e571f (документы клиента), 6f6a0b5 (начисления
продажи), 0946761 (catalog preview), затем этот локальный commit контактов.
Сайт/исходный checkout не менялись; публикация и интеграция здесь не выполнялись.

## План безопасного DB/E2E набора (пока NOTRUN)

До запуска указать один разрешённый изолированный DB endpoint/tenant, точный SHA,
синтетические fixture IDs и допустимые записи. Отдельно согласовать миграции,
если read-only сверка выявит отсутствие schema. Не копировать Production env;
не использовать существующие MAIN/PILOT клиентские операции как тестовые.

| Сценарий | Обязательные проверки |
| --- | --- |
| Аренда | create/manual price→reserve без выдачи→confirm→advance→долг блокирует выдачу→topup→issue→partial/full return; повтор каждой команды не дублирует effects |
| Продажа | draft→confirm commitment→полная оплата→handover; stock уменьшается один раз; конфликт с будущей арендой; cancel до handover |
| Закупка | supplier/purchase→partial/full receipt, BULK без instances, serialized с barcode, acquisition cost и audit совпадают |
| Повреждение | return inspection→damage/waiver по существующим правилам→deposit withholding/refund→repair→available либо writeoff; исходные qty/money сходятся |
| Конкуренция | два reserve последней единицы; issue/refund race; повторные receive/return/withhold; version conflict; реальный rollback/constraints |
| Права | owner/director/seller/cashier + ALLOW/DENY; чужой tenant/филиал; UI/action/DTO/XLSX/печать; критические действия в audit |
| Мобильность | iPhone find/scan/customer/rent/sale/payment/issue/return; принятый stocktake только compatibility regression |
| Документы/отчёты | snapshot сохраняется при изменении заказа; A4 и длинный список; timezone границы; суммы сверены с журналом без смешения валют/залогов |

Не запускать старые cleanup scripts автоматически. Порядок удаления или retention
тестовых данных определяется отдельно; отсутствие cleanup не даёт права удалять
immutable ledger/audit или действующие записи.
