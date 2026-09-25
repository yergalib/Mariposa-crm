# MARIPOSA: план полной миграции каталога

## Цель следующего этапа

Загрузить утверждённый Astana catalog из workbook SHA-256 `67FF07CA1658D1E7312FA0821C8C28CAEA83D93E69D6D5099F2F3E5B88565539` в основную MARIPOSA с итогом 330 импортируемых Products, 206 Executions, 1052 BULK Variants и 4915 единиц opening stock. Исторические RemOnline операции не переносятся.

## Gate 0: FINAL-1B — решение принято

Владелец утвердил сохранение исторических SERIALIZED `Белоснежка 0060` и `Аврора 0142` со всеми IDs/instances/документами/идентификаторами и их архивирование при будущем apply. Новые физические остатки импортируются отдельными BULK Products. Исключение строк workbook вместо этого решения не предлагается.

Свежая read-only сверка: Белоснежка — 5 Variants/51 Instances, Аврора — 3/17. Входящая `Платье 23156 Белоснежка / белый` имеет 5 конфликтующих SKU, 57 единиц, новый code `MP-R0516`; SKU `MP-R0516.BELYY.H-110/120/130/140/150`. Авроры в положительных source rows нет. Legacy code `0142.` принадлежит «Балетки 2618-75 / белый» (26–29, по 1), code нового Product `MP-R0041`; безопасные SKU `0142.26`–`0142.29` сохраняются. Полный перечень конфликтов и 476 generated SKU находится в разделе 16 спецификации.

Действия gate: повторно сверить namespace и незавершённые обязательства перед apply; запретить автоматическую отмену/перенос/переписывание истории. Архивирование не освобождает scan identifiers. При активных обязательствах остановить cutover до явного разрешения без изменения истории. 4915 — новый физический opening stock; 68 legacy Instances в него не включаются.

## Этап 1: migration schema и integrity

Добавить append-only migration:

1. `CatalogImportBatch` с organization/source hash/plan hash/status/branch/location/actor/control totals.
2. `CatalogSourceReference` с одной строкой на каждый Source Key и ссылками на Product/Execution/Variant.
3. Unique и tenant-integrity constraints/triggers.
4. RLS, revoke PUBLIC/anon/authenticated, без granting policies.
5. Terminal applied batch и source references сделать immutable.

Не изменять ProductVariant IDs, операционные foreign keys, capacity model, finance, purchases или tracking defaults.

Тесты: tenant mismatch, duplicate batch/hash, duplicate Source Key, cross-product execution, immutable applied provenance, RLS/grants.

## Этап 2: deterministic planner

Создать reviewable server/CLI module без DB writes:

1. Проверить exact filename, SHA-256, sheets и headers.
2. Читать `01_Карта_миграции` как target и `02_Источник_в_цель` как provenance.
3. Нормализовать только утверждённые system aliases: `NONE→ONE_SIZE`, `SHOE_SIZE→SHOE_EU`, `LETTER→ALPHA`, `KZ_GARMENT→KAZAKH_SIZE`.
4. Построить categories, Products, Executions, Sizes, Variants и contributions.
5. Сгенерировать internal codes, execution codes и SKU по спецификации.
6. Выполнить production namespace preflight без записи.
7. Записать gitignored manifest с source hash, plan hash и control totals.

Planner должен всегда выдавать одинаковый plan для одного workbook и target namespace snapshot. Ожидаемый dry-run:

| Метрика | Ожидается |
| --- | ---: |
| Source rows | 1063 |
| Units | 4915 |
| Products | 330 |
| Executions | 206 |
| Variants | 1052 |
| Direct / execution variants | 457 / 595 |
| Merged source rows | 11 |
| Preserved / generated SKU с текущим namespace | 576 / 476 |
| Final SKU collisions | 0 |
| Missing required target fields | 0 |

Тесты покрывают все normalization rules, 14 size systems, merged source rows, SKU conflicts, five `0060.*` conflicts и stop conditions.

## Этап 3: idempotent importer

Реализовать две явные команды:

- `catalog-full-import --dry-run` — никогда не пишет DB;
- `catalog-full-import --apply --approved-plan-hash ...` — применяет только заранее утверждённый plan.

Apply sequence:

1. Авторизовать actor и target organization.
2. Создать/перечитать CatalogImportBatch.
3. Проверить branch/location, неизменность historical IDs/identifiers и разрешение незавершённых обязательств. Зарезервировать существующие SKU/barcode/code включая архивные записи; не использовать их для новых объектов.
4. Upsert categories и Sizes с точной проверкой payload.
5. Последовательно создавать Products как DRAFT, Executions и Variants.
6. Для каждого Variant под canonical capacity lock создать source references, StockLevel delta и один `InventoryMovement.INITIAL` в одной transaction.
7. На replay сначала читать movement по organization-scoped idempotency key; payload mismatch завершает apply ошибкой.
8. После всех batches выполнить reconciliation.
9. После reconciliation, под cutover freeze, атомарно архивировать ровно два утверждённых historical Product IDs (publicationStatus/archivedAt), активировать новые Products и завершить batch. Не менять historical Variant/Instance IDs, trackingMode, codes, SKU/barcode, Orders или Movements. Дата/actor архивирования отражаются в обычном аудите.

Не использовать WAREHOUSE_RECEIPT, fake Purchase, ProductInstance или FinancialTransaction.

## Этап 4: rehearsal

Выполнить полный apply в отдельной временной organization с той же security posture. Проверить:

- exact hierarchy и labels;
- scan resolution всех 1052 SKU;
- list/detail readers;
- opening movements/stock;
- second apply создаёт ноль records и ноль stock;
- conflicting replay отклоняется;
- cleanup удаляет только rehearsal tenant по заранее проверенному ID и не ослабляет immutable production triggers.

Rehearsal не использует `MARIPOSA — PILOT` как production source и не меняет его данные.

## Этап 5: physical cutover

1. Объявить freeze RemOnline и CRM catalog/order/warehouse writes.
2. Получить финальный Astana snapshot.
3. Провести физический stocktake по утверждённым target combinations.
4. Любое расхождение оформить новой подписанной версией migration workbook/plan; не создавать старые movements.
5. Повторить dry-run и owner sign-off контрольных totals.
6. Сделать DB backup/checkpoint средствами инфраструктуры без изменения приложения.
7. Выполнить apply одним оператором.
8. Не запускать параллельно другие import или stock commands.

## Этап 6: post-import acceptance

Обязательные assertions:

- batch APPLIED и source hash совпадает;
- 1063 source references, каждый Source Key один раз;
- 330 imported Products, 206 Executions, 1052 Variants;
- 4915 StockLevel и 4915 INITIAL ledger quantity;
- ProductInstances для batch = 0;
- final SKU unique/collision-free и каждый scan возвращает ожидаемый Variant/Product/Execution;
- direct/execution counts 457/595;
- no Shymkent, zero stock rows, customers, orders, finance, purchases;
- existing SERIALIZED history и IDs сохранены; оба legacy Products archived и исключены из новых операций, historical documents по FK/ID доступны;
- 330/206/1052/4915 относятся только к новому batch, не ко всему tenant; при текущем snapshot tenant содержит 332 Products/1060 Variants и сохранённые 68 Instances;
- Аврора не создаётся из совпадения code 0142; четыре SKU балеток сохраняются;
- на каждом из 1052 planned SKU scanner возвращает только новый ожидаемый Variant; historical namespace остаётся зарезервированным;
- RLS/grants/policies соответствуют security baseline;
- catalog/order/purchase/warehouse readers работают без pool spikes.

После acceptance снять freeze и зафиксировать момент начала новой CRM operational history.

## Retry и сбои

- Сбой до первой записи: исправить plan и повторить dry-run.
- Сбой в APPLYING: не удалять immutable movements; повторить тот же batch/hash. Уже применённые targets сверяются и пропускаются.
- Payload conflict: остановить импорт, не продолжать другие batches.
- Ошибка totals: Products остаются DRAFT, freeze сохраняется, выполняется reconciliation по source references.
- После APPLIED исправления выполняются stocktake/correction с новой provenance, а не редактированием opening history.

## Performance

- concurrency DB writes = 1;
- transaction не больше одного Product или 25 Variants;
- scan/read validation concurrency ≤ 3;
- без `Promise.all` по сотням строк;
- progress checkpoint после каждого batch;
- повторное соединение не создаётся внутри row loop;
- каталог detail сохраняет последовательные тяжёлые readers, чтобы не вернуть `EMAXCONNSESSION`.

## Regression scope следующего этапа

1. Новый planner/importer targeted suite с exact counts.
2. CATALOG PILOT-1 и CATALOG UX regressions.
3. Scan/SKU namespace regression.
4. Inventory/Stocktake/Transfer.
5. Rental availability BULK/SERIALIZED.
6. SALE-1/SALE-2 commitments and fulfillment.
7. Purchases и Product Economics.
8. Orders snapshots с Execution.
9. Organization switching и tenant isolation.
10. Security checks, Prisma validate, TypeScript, ESLint, build, diff-check, migration status.

## Явно вне следующего этапа

- RemOnline customers/orders/payments/history;
- Shymkent и zero-stock rows;
- ProductInstances для BULK;
- fake purchases/acquisition history;
- rental price/deposit import как обязательные Product fields;
- photos migration, barcode printing и alias registry;
- website, Telegram, AI enrichment;
- catalog redesign, SALE-3 и fiscalization.

## FINAL-3A: controlled apply engine и rehearsal

FINAL-3A реализует apply-capable код, но не разрешает production import без полного набора точных подтверждений. Обычного `--apply` недостаточно. Команда требует exact Organization, Branch и Location IDs, утверждённые workbook SHA-256 и plan hash, утверждённый database fingerprint и фиксированную фразу `IMPORT MARIPOSA FULL CATALOG 4915`. Перед первой записью движок повторно строит plan, проверяет control totals, scan namespace, historical `0060`/`0142`, отсутствие PILOT target и fingerprint релевантного catalog/inventory namespace.

Утверждённый production preflight:

- Organization: `2157bde1-1994-465b-9f80-e1b740ee3cb1`;
- Branch: `1ae79fec-2d81-4085-982a-f7f7c64a53be`;
- Location: `7653ee57-b29f-46c8-bf75-175aa1a2a893`;
- workbook SHA-256: `67FF07CA1658D1E7312FA0821C8C28CAEA83D93E69D6D5099F2F3E5B88565539`;
- plan SHA-256: `F9D77FF910621B54CD54388A5487A3ECC703900F57C0D6777DD963DD799BF5DA`;
- database fingerprint: `A606784F116762F1CC0DEB74C9A8AA77CB05B4C4398F1019B995815D1757C75E`.

Fingerprint включает target identities, Products/codes/status, Variant SKU, ProductInstance barcode/status и StockLevel payload. Он намеренно не включает finance и другие данные, не влияющие на catalog import. Любое изменение этого namespace требует нового dry-run, нового fingerprint и повторного owner approval.

Apply выполняется последовательными replay-safe стадиями: batch, Sizes, Categories/Products, Executions, Variants, Source References, opening StockLevels/INITIAL movements, reconciliation, archival/activation и APPLIED. Записи имеют deterministic IDs или organization-scoped idempotency keys. Повторное обнаружение записи допускается только при полном совпадении payload. Stock применяется ограниченными batches по 25 Variants; uncontrolled `Promise.all` не используется.

Текущая schema не имеет отдельного Product DRAFT lifecycle. Безопасный эквивалент: новые Products создаются с `publicationStatus=DRAFT`, остаются неактивными для обычных операций до reconciliation, затем активируются. Historical Белоснежка и Аврора архивируются последними; их IDs, trackingMode, Variant/Instance identifiers и история не меняются.

Operational `ProductExecution.code` формируется детерминированно из execution label с устойчивым suffix при совпадении внутри Product. Эти технические apply codes находятся вне утверждённого business-plan hash: Product/Execution/Variant topology, SKU, source mappings и все control totals остаются неизменными. Это устраняет реальные конфликты unique constraint, не меняя принятую миграционную карту.

### Rehearsal result

Фактический apply engine выполнен в отдельной временной Organization внутри rollback-only transaction. Fixture содержал historical Белоснежка `0060` (5 Variants, 51 Instances) и Аврора `0142` (3 Variants, 17 Instances). Проверены safety gates, database drift, interruption/resume, deterministic payload conflict, полный apply, повторный replay, independent verifier и archival. Transaction намеренно откатилась; fixture после теста отсутствует.

Rehearsal получил точные результаты: 330 Products, 206 Executions, 1052 Variants, 1063 Source References, 1052 StockLevels/INITIAL movements, 4915 stock/movement quantity, 68 неизменённых historical ProductInstances и ноль Purchase/Order/FinancialTransaction. Production MARIPOSA до и после rehearsal: 2 Products, 8 Variants, 0 batches, 0 source references, 68 ProductInstances; значения не изменились.

### Failure и resume policy

- До создания batch любая ошибка завершает команду без записей.
- После создания batch статус остаётся `APPLYING`; metadata содержит последнюю завершённую стадию или `INTERRUPTED`.
- Повтор допускается только с тем же deterministic batch identity, workbook/plan hashes, target и совпадающим payload уже созданных записей.
- После INITIAL movements удаляющий rollback запрещён. Используются resume, reconciliation и при необходимости отдельная явная correction operation.
- `APPLIED` устанавливается только после независимой reconciliation, archive/activation и повторной проверки totals.

### FINAL-3B production checklist

1. Ввести operational freeze для catalog/order/warehouse writes.
2. Повторить dry-run и сравнить workbook hash, plan hash, database fingerprint и control totals.
3. Убедиться, что approved fingerprint всё ещё равен текущему. При drift остановиться и получить новое approval.
4. Сделать инфраструктурный DB checkpoint/backup.
5. Запустить одну apply command одним оператором.
6. Немедленно запустить отдельный verifier.
7. Проверить UI/scans и снять freeze только после полного acceptance.

Команда, подготовленная для будущего FINAL-3B (в FINAL-3A не выполнялась):

```powershell
npx tsx scripts/catalog-full-import-apply.ts --apply --organization=2157bde1-1994-465b-9f80-e1b740ee3cb1 --branch=1ae79fec-2d81-4085-982a-f7f7c64a53be --location=7653ee57-b29f-46c8-bf75-175aa1a2a893 --plan-hash=F9D77FF910621B54CD54388A5487A3ECC703900F57C0D6777DD963DD799BF5DA --workbook-sha256=67FF07CA1658D1E7312FA0821C8C28CAEA83D93E69D6D5099F2F3E5B88565539 --database-fingerprint=A606784F116762F1CC0DEB74C9A8AA77CB05B4C4398F1019B995815D1757C75E --confirm-production-import="IMPORT MARIPOSA FULL CATALOG 4915"
```

Independent verifier после будущего apply:

```powershell
npx tsx scripts/catalog-full-import-verify.ts --organization=2157bde1-1994-465b-9f80-e1b740ee3cb1 --branch=1ae79fec-2d81-4085-982a-f7f7c64a53be --location=7653ee57-b29f-46c8-bf75-175aa1a2a893 --plan-hash=F9D77FF910621B54CD54388A5487A3ECC703900F57C0D6777DD963DD799BF5DA --workbook-sha256=67FF07CA1658D1E7312FA0821C8C28CAEA83D93E69D6D5099F2F3E5B88565539
```
