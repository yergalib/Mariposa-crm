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
| 2. Финансовая сводка | ACTUAL, частично: `lib/dashboard/queries.ts` + `app/page.tsx` имеют today/7 days/month/last month/custom, branch scope, выручку, оплаты/возвраты, долг, залоги и принятые закупки из транзакций. Продажи попадают в `otherRevenue`, отдельного sale KPI/AOV нет. `/finance` — другая, ограниченная 30 днями сводка. | NOTRUN; FinancialTransaction, PurchaseReceiptLine | BLOCKED | NOTRUN |
| 3. Отчёты и выгрузки | ACTUAL, частично: XLSX routes клиентов, заказов, товаров, остатков, движений и финансов; `lib/catalog/economics.ts` — история/экономика модели и вариантов. На главной рейтинг 10 товаров lifetime, не выбранного периода. Отдельных полноценных отчётов utilization/idle, размеров, повреждений, закупок и AOV/продаж не найдено. | NOTRUN; existing order/stock/finance/receipt models | BLOCKED | NOTRUN; реальные файлы выгрузки здесь не генерировались |
| 4. Документы | ACTUAL, частично: `lib/orders/documents.ts`, `document-snapshot.ts`, `app/orders/[id]/documents/*` — неизменяемые неподписанные версии; `/print` — рабочий лист выдачи/возврата только RENTAL. Sale и отдельный документ удержания не реализованы. Подписание не изобретать. | NOTRUN; `20260930150000_rental_document_versions`, applied по handoff | BLOCKED | NOTRUN; печать A4/многостраничность не принималась здесь |
| 5. Права и аудит | ACTUAL, частично: `lib/permissions/{registry,effective}.ts`, branch-access, audit log, per-action checks. Два небольших исправления описаны ниже. Каталог сохраняет межфилиальный пробел; financial-page/export field permissions требуют отдельного закрытия. | NOTRUN; `stage_8d_a`, `stage_8e_a`, финансовые immutable/audit triggers | BLOCKED | NOTRUN; focused mock DENY regression ACTUAL |
| 6. Клиенты/обращения | ACTUAL, частично: контакты, normalizePhone/Email, обнаружение дублей с явным allowDuplicate, заметки, история заказов/оплат/залогов/сальдо. В карточке клиентов пока placeholder документов. Inquiry не связан с Customer/Order; единого interaction timeline нет. Ручной replyContact завершён локально. | NOTRUN; `stage_5_customers`, `inquiry_queue`, `public_showroom`; последние applied по handoff | BLOCKED | NOTRUN; replyContact mock ACTUAL |
| 7. Календарь и доступность | ACTUAL: `lib/availability/capacity.ts`, `interval.ts`, `lib/inventory/capacity-lock.ts`, `lib/orders/management.ts`, returns/bulk-maintenance; tenant/branch/timezone, buffer, locks, peak capacity, maintenance/loss logic. Наличие общего сервиса не доказывает отсутствие double booking в реальной конкурентной БД. | NOTRUN; `stage_3_5a` exclusion constraint, BULK/Sale migrations | BLOCKED | NOTRUN; нужен race + boundary/late/partial regression |
| 8. Склад/штрихкоды | ACTUAL, принято ранее по handoff: `lib/inventory`, `lib/stocktake`, `lib/scanning`, warehouse actions. Закупка различает BULK ledger/stock и SERIALIZED instances; sale fulfillment создаёт SALE_ISSUE. Не перестраивать принятую основу. | NOTRUN; `stage_8a/8b`, BULK-1…4, sale integrity SQL | BLOCKED | NOTRUN в этом проходе; предыдущая приёмка не отменяется |
| 9. Фото | ACTUAL, pipeline: `lib/catalog/images.ts` загружает оригинал и производные; `image-renditions.ts`: catalog 480, site 1600, messaging 1280, сохранение пропорций. Import planner есть; исходные фото ожидаются. Проверить, что потребители используют нужную rendition: catalog queries сейчас вызывают оригинальный signed URL. | NOTRUN; ProductImage + storage, файлы здесь не загружались | BLOCKED | NOTRUN; внешний Storage не вызывался |
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

### Выявленные оставшиеся риски

- **P1, права каталога:** `lib/catalog/queries.ts:186–189,265–266` читает
  instances/stockLevels всей организации; callers `/products` и detail передают
  defaultBranchId для цены, но не allowedBranchIds для остатков. Межфилиальные
  quantities/instances возвращаются без branch scope. Старый patch не применён.
  Нужен отдельный scoped read contract и mock fixtures двух филиалов для list,
  detail и связанных management/options/export путей.
- **P1, финансовые поля:** `lib/finance/dashboard.ts` проверяет только
  FINANCE_DASHBOARD_VIEW, возвращает cash/revenue/deposit и все виды последних
  операций; `app/finance/export/route.ts` — только REPORT_FINANCE_VIEW.
  В отличие от `lib/dashboard/queries.ts`, отдельные PAYMENT_VIEW/DEPOSIT_VIEW/
  FINANCE_MARGIN_VIEW DENY не учитываются. Нужны tests на отсутствие запрещённых
  полей/строк в DTO и XLSX, затем согласованная реализация granular visibility.
- **P2, отчётные даты:** экспорт `/finance` использует UTC-day, явно подписывает
  UTC; главная использует timezone организации, операционные страницы — филиала.
  Для бизнес-отчётов по филиалу нужно единое правило периода, особенно границы дня.
- **P2, неполные функции:** correction service без app workflow; отдельные sale
  KPI/AOV и practical reports; документы продажи/удержания; клиентские документы
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
- `tsc --noEmit --incremental false` и `next build`: ACTUAL, PASS для replyContact
  и последующих двух исправлений прав. Финальная сборка: 43/43 static pages,
  staff routes динамические; использован фиктивный DB URL `127.0.0.1:1`.
- Focused ESLint: ACTUAL, 0 errors; 1 существующее предупреждение `no-img-element`
  в WhatsApp page. `git diff --check`: ACTUAL, PASS.
- Timezone regression: ACTUAL, 14/14; payment display regression: ACTUAL, 11/11.
  Использован существующий `test-runtime-preload.cjs` для ошибки Windows
  `uv_os_get_passwd ENOMEM`. Никаких real DB imports у этих двух скриптов нет.
- Все перечисленные PASS относятся к локальным проверкам; не к DB/E2E.

## Последовательность независимых этапов

1. Закрыть подтверждённые права чтения каталога и финансовых полей; начать с
   red→green mock DENY/two-branch fixtures. Не расширять роли автоматически.
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
