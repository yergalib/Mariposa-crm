# CRM 1.0: локальный единый кандидат, 05.10.2026

Восстановленный аудит и текущие блокеры: [CRM_RECOVERY_AUDIT_20261005](CRM_RECOVERY_AUDIT_20261005.md).
Ниже сохранены состав и evidence исходного локального 07ea3e8, а не новый прогон.

Ветка `review/crm-1-0-release-candidate`. Кандидат локальный, не опубликован,
не merged и не deployed. Production/Main остаются на `9f1a848`.

## Состав

Основой служит принятый CRM Preview `7607731`. Сборочный коммит `a511e07`
восстанавливает Production auth/session/tenant/db/proxy, package manifests и
исключает изменения website/AI. Поверх него интегрирован policy package
`09c51a7` с сохранением CRM query/filter/document изменений. Frozen checkout
policy package и рабочий checkout сайта не изменены.

`lib/staff/invitations.ts` больше не импортирует удалённый PILOT module.
Уникальный hash токена определяет приглашение; membership/branch записи
создаются для tenant из этого приглашения, как в Production. Принятые ранее
renewal и organizationId в DTO сохранены. В app/lib нет runtime PILOT imports.

Reversal: ссылка в видимом финансовом журнале, отдельная scoped форма,
обязательная причина 3–500 символов, явное подтверждение и UUID idempotency key.
`PAYMENT_REVERSE`, granular read permissions и свежие branch grants ограничивают
target. Branch/customer/order выводятся на сервере из original; значения формы
не могут подменить финансовый объект. DENY закрывает прямую страницу.

Action вызывает уже существующий `reverseFinancialTransaction` без изменений
его ledger semantics: immutable original, compensating entry, audit, locks,
replay/conflict и dependent-effects guard. Существующая семантика допускает
возвращение долга после reversal оплаты уже выданного заказа; физическая выдача
не отменяется. Это явно указано в форме. Полная причина хранится в ledger;
существующий audit sanitizer ограничивает строковые metadata 300 символами.
Новый механизм замены платежа или refund не вводился.

## Проверки этого кандидата

| Проверка | Результат и границы |
| --- | --- |
| Reversal workflow/form/action | 7/7, actual source с synthetic DB adapter; canonical reversal отдельно проверен на PostgreSQL |
| Policy integration | 12/12 + 432 combinations, 4/4 concurrency scheduler; guards/query merge |
| Finance/catalog read scope | 11/11, actual XLSX roundtrip с synthetic adapter; проверено из-за изменения dashboard projection |
| Real PostgreSQL finance | 5/5: inverse effects/audit, exact replay/conflict, immutable trigger, dependent refund rejection, policy SQL на полной схеме |
| Real PostgreSQL operations | 5/5: rental reserve≠issue, deposit≠payment, partial/full payment, quantitative partial/full BULK GOOD returns, saved snapshot/hash, sale payment/one-time decrement; BULK не создаёт instances |
| Browser | 9/9, installed Chrome/CDP + actual optimized Next app + isolated SQL, включая 16 route smoke, actual login/action, mobile form, DIRECTOR DENY, dependent rejection и saved-document A4 PDF |
| Quality | Prisma generation, route typegen, typecheck, optimized build 46/46, targeted ESLint и diff checks PASS |

Ранее принятые 102/102 mock suites и 11/11 full-workbook rehearsal не повторялись
для отчётности. При подготовке нового harness исправлялись его VM globals,
fixture SQL/column/table names и DOM selector; это не ошибки реальных CRM
business flows. Финальный browser result PASS, runtime exceptions 0.

Изолированный PostgreSQL: существующий отдельный cluster, loopback port 62140,
новая synthetic database `crm_manifest_rehearsal_1791208431829`. Public schema
из проверенного backup: 61 tables / 53 triggers / 36 functions; policy columns
применены только здесь. Реальные строки клиентов из backup не восстанавливались.
App env содержит только loopback DB; Supabase/OpenAI/messaging секреты отсутствуют.
Browser имеет отдельный profile. Main/PILOT business data и Storage не затронуты.

Локальные evidence вне Git: `../crm-price-audit/crm-release-e2e-state.json`
(synthetic fixture/session данные), `crm-release-browser-evidence/result.json`,
screenshots, `saved-rental-document.pdf`, `reversal-review.pdf`, setup/operations/
browser harness scripts. Не переносить synthetic credentials в публичный Git.

## Границы и оставшийся cutover

Chrome 390px — эмуляция, не physical iPhone/camera/scanner. PDF generation не
подтверждает физическую печать. Purchase receipt/damage/maintenance, полная
матрица ролей и concurrency всех бизнес-путей не выполнялись заново в browser;
purchase/report/chat/stocktake здесь имеют route smoke. Внешние TG/WA и реальные
Storage images не подключались. Полный security E2E остаётся отложенным владельцем.

Единый code candidate и reversal UI закрыты локально. Production release ещё
блокируется отдельным разрешением live schema + полного Excel import,
доказанным old-writer barrier/drain с skew-pin closure и разрешением promotion.
Нельзя запускать blanket migrate deploy или повторять Stage8B. Полный workbook
runner и его проверенный 11/11 результат сохраняются; price-only вариант не
заменяет утверждённый полный import.
