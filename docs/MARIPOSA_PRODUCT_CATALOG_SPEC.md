# MARIPOSA: финальная спецификация каталога

## 1. Назначение и источник

Эта спецификация фиксирует структуру каталога MARIPOSA и правила полной миграции остатков Астаны. Источник миграции — только `MARIPOSA_ФИНАЛЬНАЯ_КАРТА_МИГРАЦИИ_УТВЕРЖДЕНА_2026-09-22.xlsx`, SHA-256 `67FF07CA1658D1E7312FA0821C8C28CAEA83D93E69D6D5099F2F3E5B88565539`.

Контрольные значения утверждённого файла:

| Показатель | Значение |
| --- | ---: |
| Положительных строк источника Астана | 1063 |
| Физических единиц | 4915 |
| Целевых комбинаций Product/Execution/Variant | 1052 |
| READY / нерешённых REVIEW | 1052 / 0 |
| Products | 330 |
| ProductExecutions | 206 |
| ProductVariants | 1052 |
| Объединённых дублирующих исходных строк | 11 |

Лист `02_Источник_в_цель` сохраняет 200 прежних меток `REVIEW`, но все 200 решений заполнены как «перенести», лист `03_Нужна_проверка` не содержит пустых решений, а финальный лист `01_Карта_миграции` содержит 1052 строки `READY`. Это сохранённый след согласования, а не открытый REVIEW.

## 2. Доменная модель

```text
Product
  ├─ ProductVariant
  └─ ProductExecution (опционально)
       └─ ProductVariant

ProductVariant
  ├─ Size
  ├─ StockLevel
  ├─ ProductInstance (только SERIALIZED)
  └─ операционные ссылки Orders, Rental, SALE, Purchases, Stocktake и Economics
```

`ProductVariant.id` остаётся единственным складским, capacity, order, purchase и economics leaf. `ProductExecution` описывает каталог и фотографии, но не владеет остатком, tracking mode или операционной историей.

### Product

Product — самостоятельная модель или товар. Самостоятельное название RemOnline по умолчанию становится отдельным Product. Похожие номера, цвета и названия не являются основанием для объединения. Объединение разрешено только финальной картой или зафиксированным решением владельца.

### ProductExecution

Execution создаётся только для значимого визуального или физического исполнения одной модели: цвет, рукав, материал или их сочетание. Если различия нет, Variant связывается напрямую с Product.

Допустимы шесть утверждённых Products со смешанной топологией: часть вариантов имеет Execution, часть остаётся прямой. Это `Наклейка на лицо`, `Пакеты Подарочные`, `Перчатки короткие`, `Перчатки с бантиком`, `Платье 3909-90`, `Платье 6119`. Интерфейс показывает прямую группу как «Без исполнения» только при наличии исполнения у того же Product.

### ProductVariant

Variant — комбинация, различающая складской остаток. Уникальность остаётся:

- `(productId, sizeId)` при `executionId IS NULL`;
- `(productId, executionId, sizeId)` при `executionId IS NOT NULL`.

В утверждённой карте 457 прямых Product→Variant и 595 Product→Execution→Variant. На уровне Products: 232 только прямых, 92 только с Execution, 6 смешанных.

### Tracking

Все 330 импортируемых Products и 1052 Variants миграционного набора классифицируются как `BULK`: источник задаёт количество одинаковых единиц и не содержит подтверждённой индивидуальной идентичности. `ProductInstance` не создаётся. `SERIALIZED` сохраняется для будущих уникальных или дорогих вещей и для существующей истории; текущие SERIALIZED товары автоматически не преобразуются.

## 3. Размеры и варианты

`Size` остаётся лёгким справочником `(organizationId, sizeSystem, code)`. `code` хранит исходное значение, `name` — утверждённую подпись сотруднику. Нормализованная подсказка не заменяет исходный код.

Контролируемый словарь полного импорта:

| sizeSystem | Вариантов | Смысл |
| --- | ---: | --- |
| `ONE_SIZE` | 218 | Без размера; включает 215 `—` и 3 legacy `NONE` |
| `HEIGHT_CM` | 449 | Рост в сантиметрах |
| `MANUFACTURER_SIZE` | 88 | Исходный размер производителя |
| `SHOE_EU` | 120 | Европейский размер обуви; workbook `SHOE_SIZE` нормализуется в этот ключ |
| `ALPHA` | 51 | S/M/L/XL и утверждённая подпись с диапазоном; workbook `LETTER` |
| `GARMENT_NUM` | 29 | Обычный числовой размер одежды |
| `KAZAKH_SIZE` | 24 | Размер казахстанского производителя; workbook `KZ_GARMENT` |
| `ORDINAL` | 47 | Порядковый/фабричный номер размера |
| `AGE_YEARS` | 3 | Возраст одним числом |
| `AGE_RANGE` | 4 | Возрастной диапазон |
| `VOLUME_ML` | 5 | Объём в миллилитрах |
| `DIGIT` | 5 | Цифра как вариант товара |
| `DIMENSIONS_CM` | 5 | Размеры изделия/упаковки |
| `MARIPOSA_SERIES` | 4 | Подтверждённая отдельная серия размеров без автоматического приравнивания |

Импортёр валидирует этот закрытый список. Новые ключи требуют осознанного изменения спецификации, а не свободного ввода импортом.

Подтверждённые подсказки:

- manufacturer dress `5/7/9/11/13/15` сохраняется как исходный code; `recommendedHeightCm = 104/110/120/130/140/150`;
- Yingerxie `2/3` сохраняется как исходный code; `lengthCm = 11/13`;
- диапазоны колготок сохраняются в утверждённом `Size.name`; отдельные structured range fields в текущую миграцию не добавляются;
- `ONE_SIZE` хранится технически, сотрудник видит «Без размера».

## 4. Утверждённые нормализации

- `LAN 008` / `LANI 008` — один Product.
- Shoes `623` / `B23` — одна модель, `B23` является опечаткой.
- `3909-90` / `3909-90-F` — один Product.
- `2329` и `23291` — разные Products.
- Коричневый/шоколадный объединяется только в подтверждённом владельцем случае.
- `5380` / `5380 Elsa`, `5372 Rosa` / `5372 Belle`, `25126 accent Rosa` / `25126 with Rosa`, `6119 малыши` / `6119 Белоснежка малыши` — соответствующие единые Products с различиями ниже Product.
- Рукав/без рукава может быть Execution; описания `2366` являются Executions одного Product.
- `6200` содержит основную линию и линию для малышек; строки нельзя объединять только по номеру.
- Казахские платья разных моделей и брендов остаются разными Products.
- Чешки разных названий/цветовых групп не объединяются автоматически.
- Атласные балетки и гипюровые/взрослые сетчатые балетки — разные Products.
- Перчатки и банты не объединяются автоматически.
- Цифры свечи — Variants; миллилитры атомайзера — Variants.
- Обычный, одноразовый и стеклянный атомайзеры — разные Products.
- `300/500` у духов — legacy цена, не Variant.
- Подтверждённый дополнительный ассортимент остаётся MARIPOSA.

Финальный лист workbook имеет приоритет над эвристиками и текстовым сходством.

## 5. Цена и залог

Legacy rental price и deposit сохраняются в provenance, но не создают обязательную Product/Variant семантику.

- Фактическая цена аренды хранится в OrderItem snapshot и может учитывать набор, скидку или договорённость.
- Залог относится к сделке и может быть денежным, документом или отсутствовать.
- Миграция не создаёт ProductPrice, финансовые проводки или обязательства из legacy rental/deposit.
- Себестоимость из workbook сохраняется как provenance. Она не создаёт Purchase, acquisition layer или COGS без отдельного утверждённого процесса.

## 6. Provenance полного импорта

Для пилота локального manifest было достаточно. Для полного production import он недостаточен: 11 source rows объединяются, исходные поля нужны для разбирательств, а локальный файл может быть утрачен. Рекомендуются две узкие постоянные сущности:

### CatalogImportBatch

- `id`, `organizationId`, `sourceFilename`, `sourceSha256`;
- `kind = OPENING_CATALOG`, `status = VALIDATED/APPLYING/APPLIED/FAILED`;
- `branchId`, `locationId`, `startedAt`, `completedAt`, `createdByUserId`;
- контрольные totals и plan hash;
- unique `(organizationId, sourceSha256, kind)`.

### CatalogSourceReference

- `id`, `organizationId`, `batchId`, `sourceKey`;
- исходные name/category/internalCode/SKU/barcode;
- source quantity и legacy price/deposit/cost как provenance;
- `productId`, nullable `executionId`, `productVariantId`;
- target quantity contribution и target fingerprint;
- unique `(batchId, sourceKey)`.

Обе таблицы служат только миграционному аудиту. Они не становятся PIM, складским ledger или источником доступности. Для всех 1063 Source Keys создаётся отдельная ссылка, включая все строки, слитые в один Variant. Дополнительно сохраняется gitignored signed manifest с теми же ID и movement IDs для внешней сверки.

## 7. SKU и barcode

### Нормализация

Все scan codes проходят NFKC, trim и uppercase; leading zeros сохраняются. Финальный SKU уникален в organization и проверяется против `ProductInstance.barcode` существующим DB trigger.

### Сохранение legacy SKU

Legacy SKU сохраняется как канонический только когда он:

1. непустой;
2. не заканчивается грязной точкой;
3. после нормализации соответствует ровно одной target combination;
4. не конфликтует с существующим Variant SKU или ProductInstance barcode target organization.

В workbook 633 заполненных legacy SKU, 50 с trailing dot и две collision-группы (`0208.`, `0199.2`). До production namespace безопасны 581. В текущей MARIPOSA пять из них (`0060.110`…`0060.150`) конфликтуют с действующим SERIALIZED catalog. Поэтому текущий детерминированный preflight даёт:

- safely preserved legacy SKU: **576**;
- generated canonical SKU: **476**;
- source collision groups: **2** (4 строки);
- final collision count после генерации: **0**.

### Генерация

- Product internal code: единственный очищенный legacy code сохраняется только если он однозначно принадлежит одному входящему Product и не занят существующим Product target organization (включая архивные); иначе `MP-R####`, где `####` — минимальный номер Source Key Product.
- Execution code: устойчивый ASCII slug утверждённого имени; при совпадении добавляется стабильный ordinal по первому Source Key. После применения code не меняется при переименовании label.
- Size token: system prefix + нормализованный исходный code (`H120`, `M7`, `EU22`, `A-L`, `KZ30`, `O3`, `AGE5`, `AR3-4`, `ML25`, `D1`, `DIM13X8`, `ONE`).
- Direct SKU: `{productCode}.{sizeToken}`.
- Execution SKU: `{productCode}.{executionCode}.{sizeToken}`.
- Любая коллизия получает детерминированный suffix от target fingerprint, а не случайное число.

Единственный legacy barcode `2100000000000003` сохраняется в provenance. Отдельный alias/barcode registry и печать этикеток в эту миграцию не входят. Существующие pilot/legacy identifiers не переписываются.

## 8. Opening stock

Opening stock создаётся как фактическое начальное состояние:

- `StockLevel` для Variant + Astana Branch + выбранная warehouse Location;
- один положительный `InventoryMovement(INITIAL)` на target Variant;
- `toBranchId/toLocationId` заполнены;
- `sourceType = CATALOG_OPENING_IMPORT`, `sourceId = CatalogImportBatch.id`;
- idempotency key `catalog-opening:{batchId}:{targetFingerprint}`;
- quantity равна сумме source contributions этого Variant.

Purchase, PurchaseReceipt, supplier, finance, customer, order и исторические movement не создаются. `InventoryMovement` является canonical provenance opening balance; отдельная фиктивная закупка запрещена.

Stock mutation и movement создаются атомарно под canonical branch/variant capacity lock. Если movement с ключом уже существует, importer сверяет payload и пропускает операцию. Несовпадение является конфликтом.

## 9. Идемпотентность и retry

1. Workbook hash и plan hash фиксируют вход.
2. Dry run строит полный immutable plan без записи в DB.
3. Natural keys и source references проверяются до записи.
4. Writes идут последовательно, bounded batches; каталог создаётся в `DRAFT`.
5. Каждая target combination применяется транзакционно: Variant, provenance rows, StockLevel и INITIAL movement либо применены вместе, либо не применены.
6. Retry того же batch проверяет созданные IDs/поля и не увеличивает StockLevel повторно.
7. Другой hash под тем же batch запрещён.
8. `ACTIVE` публикация выполняется только после полной reconciliation. Во время cutover создание заказов заморожено.
9. После появления immutable opening movements destructive rollback не используется: batch завершается retry или исправляется явной stocktake/correction provenance.

## 10. Полные validation invariants

- workbook filename/hash совпадают;
- 1063 уникальных `AST-*` Source Keys, все stock > 0;
- финальная карта: 1052 READY, 0 unresolved REVIEW;
- сумма source stock = target stock = 4915;
- 330 Products, 206 Executions, 1052 Variants;
- сумма `Строк источника` = 1063, merged excess = 11;
- каждая source row отображена ровно один раз;
- target key `(Product, optional Execution, sizeSystem, original Variant)` уникален;
- Product имеет одну category; workbook содержит 24 категории и 0 category conflicts;
- Execution принадлежит Product/organization;
- Size и Variant принадлежат organization;
- 1052 Variants классифицированы BULK, ProductInstances = 0;
- 457 direct и 595 execution variants;
- final SKU namespace содержит 1052 уникальных codes и не пересекается с instance barcodes;
- StockLevel sum = INITIAL movement sum = source sum = 4915;
- Astana branch/location only; Shymkent отсутствует;
- customers/orders/payments/finance/purchases не создаются;
- import batch не включает изолированную organization `MARIPOSA — PILOT`.

Warnings, не являющиеся ошибками: 419 отсутствующих legacy SKU, 419 отсутствующих legacy internal codes, 50 trailing-dot SKU, две legacy collision-группы, шесть смешанных topology Products и 200 сохранённых старых REVIEW labels с заполненным решением «перенести».

## 11. Cutover

1. Зафиксировать время прекращения изменений в RemOnline.
2. Сделать финальный Astana snapshot и проверить SHA/структуру против утверждённого workbook.
3. Провести физическую инвентаризацию по Variant/Execution/Product.
4. Расхождения внести в новую версию утверждённого source plan с новым hash; исторические movements RemOnline не реконструировать.
5. Получить owner sign-off totals; применить уже принятое решение FINAL-1B по архивированию SERIALIZED `0060`/`0142` после проверки незавершённых обязательств.
6. Выполнить read-only dry run против production namespace.
7. Заморозить catalog/order/warehouse mutations на время apply.
8. Применить migration batch с Products в DRAFT.
9. Сверить все invariants, scan resolution и tenant boundaries.
10. Активировать импортированные Products, снять freeze и начать новую CRM history.

## 12. Security и tenancy

- importer принимает явный organization/branch/location и сверяет их связи;
- запуск требует authenticated active OWNER или отдельной server-side migration capability;
- authorization выполняется до idempotency replay;
- новые public tables получают RLS, без granting policies, anon/authenticated privileges = 0;
- server Prisma остаётся единственным write path;
- workbook, manifest, secrets и DATABASE_URL не коммитятся;
- все queries включают organizationId; pilot organization исключается по ID, не по похожему имени.

## 13. Performance

- полный plan строится в памяти одним чтением workbook;
- DB preflight выполняется агрегированными reads;
- записи идут bounded batches без uncontrolled `Promise.all`;
- один transaction/client выполняет ограниченный блок, предпочтительно один Product или до 25 Variants;
- scan validation выполняется последовательно или с concurrency не выше 3;
- catalog readers не получают новые nested queries;
- длинные Prisma transactions имеют явные maxWait/timeout и не занимают несколько pool sessions.

## 14. Website, Telegram и AI

Текущая модель уже поддерживает Product photos, Execution photos, Variant sizes, SKU и availability. Website позже читает опубликованный каталог и не создаёт Order напрямую. Telegram показывает каталог и создаёт Lead/Inquiry, но не reservation. AI enrichment может предлагать controlled attributes, synonyms и photo tags только с подтверждением человека. Generic attribute JSON и PIM в эту спецификацию не входят.

## 15. Реальные примеры

- `Платье 5380` → Executions `Белый/Розовый/Шампань` → height Variants → BULK stock.
- `Платье 2366` → material/color/sleeve Executions → manufacturer sizes с advisory height.
- `Туфли N01` → `Бордо/Молочный` → EU size.
- `Туфли тканевые Yingerxie` → `Белый/Розовый` → manufacturer size + length.
- `Свечка-цифра` → direct DIGIT Variants.
- `Атомайзер` → direct VOLUME_ML Variants; типы атомайзеров являются разными Products.
- `Колечко` → direct ONE_SIZE.
- `Платье LAN 008` объединяет подтверждённую опечатку LAN/LANI и сохраняет все source references.

## 16. FINAL-1B: принятое решение владельца

Исторические SERIALIZED Products сохраняются навсегда со своими IDs, Variant IDs, ProductInstances, SKU, barcode, inventoryNumber, Orders и Movements. При будущем apply они архивируются через `publicationStatus=ARCHIVED` и `archivedAt`, без изменения trackingMode и без переназначения экземпляров. Новые физические остатки из workbook создаются как отдельные BULK Products. Вопрос выбора между архивированием и исключением строк закрыт владельцем: строки workbook не исключаются.

| Исторический Product | Product ID | Код | Variants | Instances |
| --- | --- | --- | ---: | ---: |
| Белоснежка | 5dd52562-0e1f-45a9-811b-fcc4a5fd44cb | 0060 | 5 | 51 |
| Аврора | 6ac1a49f-57c1-433e-90df-2b4a7d25d78a | 0142 | 3 | 17 |

На 2026-09-24 namespace основной MARIPOSA содержит 2 Product codes, 8 Variant SKU и 68 instance barcodes. Все они резервируются при preflight, даже если Product будет архивирован. Архивирование не освобождает идентификаторы.

### Точные входящие конфликты

`01_Карта_миграции` строки 443–447: новый Product **Платье 23156 Белоснежка**, исполнение **белый**. Legacy Product code `0060.` после удаления завершающей точки конфликтует с историческим `0060`; новый code — `MP-R0516`.

| Строка workbook | Source Key | Размер | Штук | Старый SKU (provenance) | Новый канонический SKU |
| ---: | --- | --- | ---: | --- | --- |
| 443 | AST-SL1-R0516 | 110 | 16 | 0060.110 | MP-R0516.BELYY.H-110 |
| 444 | AST-SL1-R0517 | 120 | 10 | 0060.120 | MP-R0516.BELYY.H-120 |
| 445 | AST-SL1-R0518 | 130 | 8 | 0060.130 | MP-R0516.BELYY.H-130 |
| 446 | AST-SL1-R0519 | 140 | 11 | 0060.140 | MP-R0516.BELYY.H-140 |
| 447 | AST-SL1-R0520 | 150 | 12 | 0060.150 | MP-R0516.BELYY.H-150 |

Итого конфликтующие Variant SKU: 5, физических единиц: 57. Никакие исторические ссылки не переписываются.

**Аврора:** в целевой карте и в исходных положительных строках нет названия «Аврора»; новый BULK Product «Аврора» не создаётся. `0142.` в workbook принадлежит **Балетки 2618-75**, исполнение **белый**: строки карты 190–193, Source Keys `AST-SL1-R0041`–`AST-SL1-R0044`, размеры 26/27/28/29, по 1 единице. Новый Product code — `MP-R0041`. Их SKU `0142.26`, `0142.27`, `0142.28`, `0142.29` сохраняются: они не равны историческим `0142.110`, `0142.120`, `0142.130` и не равны ни одному instance barcode. SKU не обязан начинаться с текущего Product internalCode; существующие builders задают генерацию, но не такой инвариант. Совпадение префикса не означает одну модель. Source Key `AST-SL1-R0142` относится к «Жилет красный», а не к Product code 0142.

### Все collision groups

1. Между source и production Product codes: `0060` и `0142`, описаны выше.
2. Между source и production Variant SKU: `0060.110`, `0060.120`, `0060.130`, `0060.140`, `0060.150`.
3. Внутри source SKU: `0208.` — «Мозаика розовая» (строка 59, `AST-SL1-R0347`) и «Набор резинок синие» (строка 1029, `AST-SL1-R0355`); `0199.2` — «Колготки с бантиком / белый», 2XL (строка 173, `AST-SL1-R0235`) и L (строка 174, `AST-SL1-R0236`). Все четыре получают новые SKU, см. полный перечень ниже.
4. Внутри source очищенных Product codes между разными Products: `0208` — «Мозаика розовая» / «Набор резинок синие»; `0234` — «Атомайзер» / «Атомайзер стеклянные». Новый Product code генерируется для каждого владельца конфликтного code. Повтор code у размеров одного Product не считается конфликтом.
5. Source SKU ↔ production instance barcode: 0; source barcode ↔ production SKU/barcode: 0. Единственный source barcode `2100000000000003` остаётся provenance, не новым scan alias.

### Зафиксированная генерация и проверка всего набора

Приоритет идентификаторов: (1) весь существующий namespace, включая архивные объекты; (2) все безопасные legacy SKU входящего набора; (3) generated SKU. Безопасные legacy значения резервируются до генерации. Preflight проверил все 1052 будущих SKU, а не только пять известных конфликтов.

Для точного воспроизведения плана: порядок — минимальный Source Key; fallback Product code `MP-R####` использует последний компонент минимального Source Key. Execution slug: NFKC/uppercase, русская транслитерация `А=A, Б=B, В=V, Г=G, Д=D, Е=E, Ё=YO, Ж=ZH, З=Z, И=I, Й=Y, К=K, Л=L, М=M, Н=N, О=O, П=P, Р=R, С=S, Т=T, У=U, Ф=F, Х=KH, Ц=TS, Ч=CH, Ш=SH, Щ=SHCH, Ъ=пусто, Ы=Y, Ь=пусто, Э=E, Ю=YU, Я=YA`; прочие серии символов заменяются `-`, края очищаются. При одинаковом slug одного Product добавляется `-R####` минимального Source Key исполнения. Полученный code фиксируется и не меняется при переименовании.

Size token в вычисленном плане: `ONE` без размера; иначе префикс `H/M/EU/A/KZ/G/O/AGE/AR/ML/D/DIM/MS` по системе + `-` + исходное значение после NFKC/uppercase и замены серий символов вне ASCII A–Z/0–9 на `-`. Исходное значение Size не меняется; token относится только к SKU. Если кандидат занят или длиннее 100 символов: первые 80 символов base + `.` + первые 16 hex SHA-256 UTF-8 JSON `[Product, raw Execution, raw sizeSystem, raw Variant]` без пробелов, uppercase. После fallback снова обязательна проверка; при остаточном конфликте STOP, а не случайный suffix. Полный вычисленный перечень generated SKU зафиксирован ниже и является проверяемым результатом этого design preflight, не импортом.

Результат: **576 preserved SKU + 476 generated SKU = 1052**, **0 final SKU collisions**, **0 пересечений с 68 историческими barcode**, **0 итоговых конфликтов Product codes**. У исторических 8 SKU/68 barcode тоже нет scan-коллизий. После apply новый каталог разрешается однозначно; archived historical instances не участвуют в обычном scanner lookup. Их документы продолжают разрешать Product/Variant/Instance по неизменным FK/ID. Это design/preflight доказательство; end-to-end scanner acceptance для импортированных записей выполняется после будущего apply.

### Архивирование и opening stock

`getCatalogProducts` исключает archived Products; rental selection, SALE draft/confirmation и scan resolver проверяют `archivedAt`. Detail reader сохраняет разрешение по ID с tenant check. Исторические документы сохраняют snapshots и FK. Перед применением нужно проверить незавершённые rentals/commitments: архивирование не является их отменой/возвратом, а импорт 4915 on-hand не должен дублировать физически выданное. Если есть незакрытые обязательства, cutover блокируется до явного операционного разрешения; история не переписывается. В новом этапе нужны regression guards для прямых write-paths, чтобы archived legacy Product нельзя было использовать для новых операций, сохраняя допустимое завершение старых.

4915 — только новые opening units; 68 сохранённых исторических instances не прибавляются к этой сумме. 330/206/1052 — counts импортируемого набора, а не всех строк tenant. При текущем snapshot после добавления будет 332 Products (330 новых + 2 исторических) и 1060 Variants (1052 новых + 8 исторических), 68 прежних Instances; PILOT organization в эти числа не входит. Перед apply повторить preflight; изменения namespace требуют нового утверждённого plan.

### Полный перечень 476 generated SKU

Остальные 576 строки сохраняют нормализованный legacy SKU. Source Key позволяет однозначно найти исходную строку и все merged contributions в workbook.

| Строка карты | Source Keys | Новый SKU |
| ---: | --- | --- |
| 1025 | AST-SL1-R0032 | `MP-R0032.ONE` |
| 1008 | AST-SL1-R0033 | `0235.ML-10` |
| 198 | AST-SL1-R0050 | `MP-R0041.CHERNYY.EU-31` |
| 186 | AST-SL1-R0051 | `MP-R0051.EU-37` |
| 187 | AST-SL1-R0052 | `MP-R0051.EU-38` |
| 188 | AST-SL1-R0053 | `MP-R0051.EU-39` |
| 189 | AST-SL1-R0054 | `MP-R0051.EU-40` |
| 200 | AST-SL1-R0056 | `MP-R0056.EU-39` |
| 883 | AST-SL1-R0057 | `MP-R0057.ONE` |
| 1011 | AST-SL1-R0058 | `0236.ONE` |
| 3 | AST-SL1-R0071 | `MP-R0071.ONE` |
| 4 | AST-SL1-R0072 | `MP-R0072.ONE` |
| 5 | AST-SL1-R0073 | `MP-R0073.PO-3000.ONE` |
| 6 | AST-SL1-R0074 | `MP-R0073.PO-3500.ONE` |
| 7 | AST-SL1-R0076 | `MP-R0076.ONE` |
| 8 | AST-SL1-R0077 | `MP-R0077.ONE` |
| 993 | AST-SL1-R0078 | `MP-R0078.ONE` |
| 1036 | AST-SL1-R0079 | `MP-R0079.ONE` |
| 28 | AST-SL1-R0080 | `MP-R0080.A-XL` |
| 29 | AST-SL1-R0081 | `0006.ONE` |
| 31 | AST-SL1-R0082 | `MP-R0082.BELYY.ONE` |
| 30 | AST-SL1-R0083 | `MP-R0083.ONE` |
| 33 | AST-SL1-R0084 | `MP-R0082.LILOVYY.ONE` |
| 32 | AST-SL1-R0085 | `MP-R0082.GOLUBOY.ONE` |
| 856 | AST-SL1-R0086 | `0003.ONE` |
| 35 | AST-SL1-R0087 | `MP-R0087.BELYY.ONE` |
| 36 | AST-SL1-R0088 | `MP-R0087.ROZOVYY.ONE` |
| 37 | AST-SL1-R0089 | `0008.ONE` |
| 38 | AST-SL1-R0090 | `MP-R0090.ONE` |
| 39 | AST-SL1-R0091 | `MP-R0091.ONE` |
| 40 | AST-SL1-R0092 | `MP-R0092.ONE` |
| 34 | AST-SL1-R0094 | `MP-R0082.ROZOVYY.ONE` |
| 1037 | AST-SL1-R0095 | `MP-R0095.ONE` |
| 891 | AST-SL1-R0096 | `0185.ONE` |
| 892 | AST-SL1-R0097 | `0009.ONE` |
| 994 | AST-SL1-R0098 | `MP-R0098.ONE` |
| 1012 | AST-SL1-R0100 | `MP-R0100.ONE` |
| 1013 | AST-SL1-R0101 | `MP-R0101.ONE` |
| 1026 | AST-SL1-R0102 | `MP-R0102.GOLUBOY.ONE` |
| 894 | AST-SL1-R0103 | `0010.ONE` |
| 893 | AST-SL1-R0104 | `0010.O-4` |
| 895 | AST-SL1-R0105 | `MP-R0105.ONE` |
| 41 | AST-SL1-R0106 | `MP-R0106.ONE` |
| 42 | AST-SL1-R0133 | `0015.ONE` |
| 43 | AST-SL1-R0134 | `MP-R0134.ONE` |
| 1014 | AST-SL1-R0135 | `0237.PO-300.ONE` |
| 1015 | AST-SL1-R0136 | `0237.PO-500.ONE` |
| 964 | AST-SL1-R0137 | `MP-R0137.H-120` |
| 357 | AST-SL1-R0138 | `MP-R0138.G-32` |
| 921 | AST-SL1-R0146 | `0191.G-32` |
| 922 | AST-SL1-R0147 | `0191.G-34` |
| 923 | AST-SL1-R0148 | `0191.G-36` |
| 924 | AST-SL1-R0149 | `0191.G-38` |
| 925 | AST-SL1-R0150 | `0191.G-40` |
| 926 | AST-SL1-R0151 | `0191.G-42` |
| 306 | AST-SL1-R0152 | `MP-R0152.AR-3-4` |
| 307 | AST-SL1-R0153 | `MP-R0152.AR-5-6` |
| 308 | AST-SL1-R0154 | `MP-R0152.AR-7-8` |
| 309 | AST-SL1-R0155 | `MP-R0152.AR-9-10` |
| 301 | AST-SL1-R0156 | `MP-R0156.G-30` |
| 302 | AST-SL1-R0157 | `MP-R0156.G-32` |
| 303 | AST-SL1-R0158 | `MP-R0156.G-34` |
| 304 | AST-SL1-R0159 | `MP-R0156.G-36` |
| 305 | AST-SL1-R0160 | `MP-R0156.G-38` |
| 44 | AST-SL1-R0171 | `MP-R0171.ONE` |
| 45 | AST-SL1-R0172 | `MP-R0172.ONE` |
| 46 | AST-SL1-R0173 | `MP-R0173.ONE` |
| 47 | AST-SL1-R0174 | `MP-R0174.ONE` |
| 48 | AST-SL1-R0175 | `0016.ONE` |
| 49 | AST-SL1-R0176 | `MP-R0176.MOLOCHNYY.ONE` |
| 50 | AST-SL1-R0177 | `MP-R0176.CHERNYY.ONE` |
| 857 | AST-SL1-R0178 | `MP-R0178.ONE` |
| 51 | AST-SL1-R0179 | `MP-R0179.ONE` |
| 52 | AST-SL1-R0180 | `MP-R0180.ONE` |
| 53 | AST-SL1-R0181 | `MP-R0181.ONE` |
| 54 | AST-SL1-R0182 | `MP-R0182.ONE` |
| 858 | AST-SL1-R0183 | `MP-R0183.ONE` |
| 1028 | AST-SL1-R0184 | `MP-R0184.ONE` |
| 108 | AST-SL1-R0185 | `MP-R0185.ONE` |
| 363 | AST-SL1-R0188 | `0193.KZ-36` |
| 365 | AST-SL1-R0189 | `0193.KZ-42` |
| 366 | AST-SL1-R0190 | `0193.KZ-44` |
| 109 | AST-SL1-R0191 | `MP-R0191.ONE` |
| 1038 | AST-SL1-R0192 | `MP-R0192.ONE` |
| 1039 | AST-SL1-R0193 | `MP-R0193.ONE` |
| 1040 | AST-SL1-R0194 | `MP-R0194.ONE` |
| 149 | AST-SL1-R0199 | `MP-R0199.A-L` |
| 150 | AST-SL1-R0200 | `MP-R0199.A-M` |
| 151 | AST-SL1-R0201 | `MP-R0199.A-S` |
| 152 | AST-SL1-R0202 | `MP-R0199.A-XL` |
| 161 | AST-SL1-R0204 | `MP-R0195.ROZOVYY.A-2XL` |
| 173 | AST-SL1-R0235 | `MP-R0235.BELYY.A-2XL-125-140` |
| 174 | AST-SL1-R0236 | `MP-R0235.BELYY.A-L-100-110` |
| 179 | AST-SL1-R0241 | `MP-R0241.BELYY.A-L-150` |
| 180 | AST-SL1-R0242 | `MP-R0241.BELYY.A-M-130` |
| 181 | AST-SL1-R0243 | `MP-R0241.BELYY.A-S-90` |
| 182 | AST-SL1-R0244 | `MP-R0241.ROZOVYY.A-L-150` |
| 183 | AST-SL1-R0245 | `MP-R0241.CHERNYY.A-L-150` |
| 184 | AST-SL1-R0246 | `MP-R0241.CHERNYY.A-M-130` |
| 185 | AST-SL1-R0247 | `MP-R0241.CHERNYY.A-S-90` |
| 9 | AST-SL1-R0253 | `0026.ONE` |
| 10 | AST-SL1-R0254 | `MP-R0254.PO-1000.ONE` |
| 11 | AST-SL1-R0255 | `MP-R0254.PO-2000.ONE` |
| 12 | AST-SL1-R0256 | `MP-R0254.PO-3000.ONE` |
| 13 | AST-SL1-R0257 | `MP-R0254.PO-4000.ONE` |
| 14 | AST-SL1-R0258 | `MP-R0254.PO-5000.ONE` |
| 2 | AST-SL1-R0259 | `MP-R0259.PO-5000.ONE` |
| 995 | AST-SL1-R0260 | `MP-R0260.ONE` |
| 847 | AST-SL1-R0262, AST-SL1-R1404 | `MP-R0262.KORICHNEVYY-SHOKOLADNYY-BELYY-VOROTNIK.H-100` |
| 848 | AST-SL1-R0263, AST-SL1-R1405 | `MP-R0262.KORICHNEVYY-SHOKOLADNYY-BELYY-VOROTNIK.H-110` |
| 849 | AST-SL1-R0264, AST-SL1-R1406 | `MP-R0262.KORICHNEVYY-SHOKOLADNYY-BELYY-VOROTNIK.H-120` |
| 850 | AST-SL1-R0265, AST-SL1-R1407 | `MP-R0262.KORICHNEVYY-SHOKOLADNYY-BELYY-VOROTNIK.H-80` |
| 851 | AST-SL1-R0266, AST-SL1-R1408 | `MP-R0262.KORICHNEVYY-SHOKOLADNYY-BELYY-VOROTNIK.H-90` |
| 1041 | AST-SL1-R0267 | `MP-R0267.ONE` |
| 1042 | AST-SL1-R0268 | `MP-R0268.ONE` |
| 859 | AST-SL1-R0269 | `MP-R0269.ONE` |
| 860 | AST-SL1-R0270 | `MP-R0270.ONE` |
| 861 | AST-SL1-R0271 | `0027.ONE` |
| 55 | AST-SL1-R0272 | `0028.ONE` |
| 862 | AST-SL1-R0273 | `0029.ONE` |
| 863 | AST-SL1-R0274 | `MP-R0274.ONE` |
| 125 | AST-SL1-R0275 | `MP-R0275.ONE` |
| 937 | AST-SL1-R0281 | `MP-R0281.H-100` |
| 938 | AST-SL1-R0282 | `MP-R0281.H-140` |
| 939 | AST-SL1-R0283 | `MP-R0281.H-90` |
| 944 | AST-SL1-R0288 | `0031.H-150` |
| 947 | AST-SL1-R0291 | `MP-R0291.H-120` |
| 948 | AST-SL1-R0292 | `MP-R0292.H-110` |
| 949 | AST-SL1-R0293 | `MP-R0292.H-120` |
| 950 | AST-SL1-R0294 | `MP-R0292.H-130` |
| 951 | AST-SL1-R0295 | `MP-R0292.H-150` |
| 956 | AST-SL1-R0300 | `MP-R0296.H-140` |
| 864 | AST-SL1-R0308 | `0204.ONE` |
| 56 | AST-SL1-R0309 | `0205.ONE` |
| 57 | AST-SL1-R0310 | `0206.ONE` |
| 865 | AST-SL1-R0311 | `0207.ONE` |
| 15 | AST-SL1-R0312 | `MP-R0312.PO-2500.ONE` |
| 16 | AST-SL1-R0313 | `MP-R0312.PO-3000.ONE` |
| 17 | AST-SL1-R0314 | `MP-R0312.PO-4000.ONE` |
| 18 | AST-SL1-R0315 | `MP-R0312.PO-5000.ONE` |
| 312 | AST-SL1-R0316 | `MP-R0316.O-1` |
| 313 | AST-SL1-R0317 | `MP-R0316.O-2` |
| 314 | AST-SL1-R0318 | `MP-R0316.O-3` |
| 315 | AST-SL1-R0319 | `MP-R0316.O-4` |
| 316 | AST-SL1-R0320 | `MP-R0316.O-5` |
| 317 | AST-SL1-R0321 | `MP-R0316.O-6` |
| 318 | AST-SL1-R0322 | `MP-R0322.O-2` |
| 319 | AST-SL1-R0323 | `MP-R0322.O-3` |
| 320 | AST-SL1-R0324 | `MP-R0322.O-4` |
| 321 | AST-SL1-R0325 | `MP-R0322.O-5` |
| 322 | AST-SL1-R0326 | `MP-R0322.O-6` |
| 323 | AST-SL1-R0327 | `MP-R0327.A-2XL` |
| 324 | AST-SL1-R0328 | `MP-R0327.A-3XL` |
| 325 | AST-SL1-R0329 | `MP-R0327.A-L` |
| 326 | AST-SL1-R0331 | `MP-R0327.A-S` |
| 327 | AST-SL1-R0332 | `MP-R0327.A-XL` |
| 328 | AST-SL1-R0333 | `MP-R0333.O-1` |
| 329 | AST-SL1-R0334 | `MP-R0333.O-2` |
| 330 | AST-SL1-R0335 | `MP-R0333.O-3` |
| 331 | AST-SL1-R0336 | `MP-R0333.O-4` |
| 332 | AST-SL1-R0337 | `MP-R0333.O-5` |
| 333 | AST-SL1-R0338 | `MP-R0333.O-6` |
| 334 | AST-SL1-R0339 | `MP-R0339.A-L` |
| 335 | AST-SL1-R0340 | `MP-R0339.A-M` |
| 336 | AST-SL1-R0341 | `MP-R0339.A-S` |
| 884 | AST-SL1-R0342 | `MP-R0342.ONE` |
| 885 | AST-SL1-R0343 | `MP-R0343.ONE` |
| 886 | AST-SL1-R0344 | `MP-R0344.ONE` |
| 996 | AST-SL1-R0346 | `MP-R0346.ONE` |
| 59 | AST-SL1-R0347 | `MP-R0347.ONE` |
| 58 | AST-SL1-R0348 | `MP-R0348.ONE` |
| 997 | AST-SL1-R0350 | `MP-R0350.ONE` |
| 998 | AST-SL1-R0351 | `MP-R0351.ONE` |
| 999 | AST-SL1-R0353 | `MP-R0353.ONE` |
| 1000 | AST-SL1-R0354 | `MP-R0354.ONE` |
| 1029 | AST-SL1-R0355 | `MP-R0355.ONE` |
| 1001 | AST-SL1-R0356 | `MP-R0356.ONE` |
| 1016 | AST-SL1-R0363 | `MP-R0363.ONE` |
| 1018 | AST-SL1-R0364 | `0035.ONE` |
| 1017 | AST-SL1-R0367 | `0035.ROZOVYY.ONE` |
| 888 | AST-SL1-R0370 | `MP-R0370.A-S` |
| 887 | AST-SL1-R0371 | `MP-R0370.A-M` |
| 367 | AST-SL1-R0372 | `MP-R0372.KZ-30` |
| 368 | AST-SL1-R0373 | `MP-R0372.KZ-32` |
| 369 | AST-SL1-R0374 | `MP-R0372.KZ-34` |
| 370 | AST-SL1-R0375 | `MP-R0372.KZ-36` |
| 371 | AST-SL1-R0376 | `MP-R0372.KZ-38` |
| 60 | AST-SL1-R0377 | `MP-R0377.ONE` |
| 110 | AST-SL1-R0378 | `MP-R0378.ONE` |
| 1019 | AST-SL1-R0379 | `MP-R0379.ONE` |
| 63 | AST-SL1-R0380 | `MP-R0380.PO-3000.ONE` |
| 61 | AST-SL1-R0381 | `MP-R0381.ONE` |
| 62 | AST-SL1-R0382 | `MP-R0382.ONE` |
| 66 | AST-SL1-R0383 | `MP-R0383.ONE` |
| 70 | AST-SL1-R0384 | `MP-R0384.BELYY.ONE` |
| 67 | AST-SL1-R0385 | `MP-R0385.ONE` |
| 68 | AST-SL1-R0386 | `MP-R0386.ONE` |
| 866 | AST-SL1-R0387 | `0209.ONE` |
| 69 | AST-SL1-R0388 | `0036.ONE` |
| 867 | AST-SL1-R0389 | `0037.ONE` |
| 71 | AST-SL1-R0390 | `MP-R0384.ZOLOTOY.ONE` |
| 72 | AST-SL1-R0392 | `MP-R0392.BELYY.ONE` |
| 73 | AST-SL1-R0393 | `MP-R0392.ZOLOTOY.ONE` |
| 64 | AST-SL1-R0394 | `MP-R0394.ONE` |
| 74 | AST-SL1-R0395 | `0038.ONE` |
| 65 | AST-SL1-R0396 | `MP-R0396.ONE` |
| 75 | AST-SL1-R0397 | `MP-R0397.ONE` |
| 76 | AST-SL1-R0398 | `MP-R0398.ONE` |
| 77 | AST-SL1-R0399 | `0039.ONE` |
| 78 | AST-SL1-R0400 | `MP-R0400.ONE` |
| 1002 | AST-SL1-R0403 | `MP-R0403.ONE` |
| 1030 | AST-SL1-R0404 | `MP-R0404.ONE` |
| 1031 | AST-SL1-R0405 | `MP-R0405.ONE` |
| 79 | AST-SL1-R0408 | `MP-R0408.CHERNYY.ONE` |
| 80 | AST-SL1-R0409 | `MP-R0408.SHOKOLADNYY.ONE` |
| 111 | AST-SL1-R0411 | `MP-R0411.BELYY.ONE` |
| 112 | AST-SL1-R0412 | `MP-R0411.ROZOVYY.ONE` |
| 113 | AST-SL1-R0413 | `MP-R0411.CHERNYY.ONE` |
| 121 | AST-SL1-R0414 | `MP-R0414.GOLUBOY.ONE` |
| 114 | AST-SL1-R0415 | `0046.ONE` |
| 115 | AST-SL1-R0416 | `0047.BELYY.ONE` |
| 116 | AST-SL1-R0417 | `0047.SHAMPAN.ONE` |
| 122 | AST-SL1-R0418 | `MP-R0414.ROZOVYY.ONE` |
| 118 | AST-SL1-R0419 | `MP-R0419.ONE` |
| 120 | AST-SL1-R0420 | `MP-R0420.ONE` |
| 119 | AST-SL1-R0422 | `MP-R0420.GOLUBOY-AKTSENT.ONE` |
| 117 | AST-SL1-R0424 | `0047.ONE` |
| 124 | AST-SL1-R0426 | `MP-R0426.ONE` |
| 123 | AST-SL1-R0427 | `MP-R0414.SHAMPAN.ONE` |
| 1032 | AST-SL1-R0428 | `MP-R0428.ONE` |
| 1033 | AST-SL1-R0429 | `MP-R0429.ONE` |
| 384 | AST-SL1-R0451 | `MP-R0430.SHAMPAN-RUKAV.M-7` |
| 385 | AST-SL1-R0452 | `MP-R0430.SHAMPAN-RUKAV.M-9` |
| 443 | AST-SL1-R0516 | `MP-R0516.BELYY.H-110` |
| 444 | AST-SL1-R0517 | `MP-R0516.BELYY.H-120` |
| 445 | AST-SL1-R0518 | `MP-R0516.BELYY.H-130` |
| 446 | AST-SL1-R0519 | `MP-R0516.BELYY.H-140` |
| 447 | AST-SL1-R0520 | `MP-R0516.BELYY.H-150` |
| 464 | AST-SL1-R0539 | `MP-R0539.BELYY.H-110` |
| 465 | AST-SL1-R0540 | `MP-R0539.BELYY.H-120` |
| 466 | AST-SL1-R0541 | `MP-R0539.BELYY.H-130` |
| 467 | AST-SL1-R0542 | `MP-R0539.BELYY.H-140` |
| 468 | AST-SL1-R0543 | `MP-R0539.BELYY.H-150` |
| 469 | AST-SL1-R0544 | `MP-R0539.ROZOVYY.H-110` |
| 470 | AST-SL1-R0545 | `MP-R0539.ROZOVYY.H-120` |
| 471 | AST-SL1-R0546 | `MP-R0539.ROZOVYY.H-130` |
| 472 | AST-SL1-R0547 | `MP-R0539.ROZOVYY.H-140` |
| 473 | AST-SL1-R0548 | `MP-R0539.ROZOVYY.H-150` |
| 502 | AST-SL1-R0575 | `MP-R0575.ROZOVYY.H-110` |
| 503 | AST-SL1-R0576 | `MP-R0575.ROZOVYY.H-120` |
| 504 | AST-SL1-R0577 | `MP-R0575.ROZOVYY.H-130` |
| 505 | AST-SL1-R0578 | `MP-R0575.ROZOVYY.H-140` |
| 506 | AST-SL1-R0579 | `MP-R0575.ROZOVYY.H-150` |
| 512 | AST-SL1-R0594 | `0111.ROZOVYY.M-15` |
| 516 | AST-SL1-R0598 | `0111.SINIY.MS-15` |
| 517 | AST-SL1-R0599 | `0111.SINIY.MS-5` |
| 518 | AST-SL1-R0600 | `0111.SINIY.MS-7` |
| 519 | AST-SL1-R0601 | `0111.SINIY.MS-9` |
| 587 | AST-SL1-R0707 | `MP-R0707.BELYY.H-120` |
| 588 | AST-SL1-R0708 | `MP-R0707.BELYY.H-130` |
| 589 | AST-SL1-R0709 | `MP-R0707.BELYY.H-140` |
| 590 | AST-SL1-R0710 | `MP-R0707.BELYY.H-150` |
| 591 | AST-SL1-R0711 | `MP-R0707.BELYY.H-160` |
| 592 | AST-SL1-R0712 | `MP-R0707.SHAMPAN.H-120` |
| 593 | AST-SL1-R0713 | `MP-R0707.SHAMPAN.H-130` |
| 594 | AST-SL1-R0714 | `MP-R0707.SHAMPAN.H-140` |
| 595 | AST-SL1-R0715 | `MP-R0707.SHAMPAN.H-150` |
| 596 | AST-SL1-R0716 | `MP-R0707.SHAMPAN.H-160` |
| 603 | AST-SL1-R0732 | `MP-R0732.ROZOVYY.H-110` |
| 604 | AST-SL1-R0733 | `MP-R0732.ROZOVYY.H-120` |
| 605 | AST-SL1-R0734 | `MP-R0732.ROZOVYY.H-130` |
| 606 | AST-SL1-R0735 | `MP-R0732.ROZOVYY.H-140` |
| 607 | AST-SL1-R0736 | `MP-R0732.ROZOVYY.H-150` |
| 608 | AST-SL1-R0738 | `MP-R0732.SHAMPAN.H-120` |
| 609 | AST-SL1-R0739 | `MP-R0732.SHAMPAN.H-130` |
| 610 | AST-SL1-R0740 | `MP-R0732.SHAMPAN.H-140` |
| 611 | AST-SL1-R0741 | `MP-R0732.SHAMPAN.H-150` |
| 612 | AST-SL1-R0742 | `MP-R0742.BELYY.H-110` |
| 613 | AST-SL1-R0743 | `MP-R0742.BELYY.H-120` |
| 614 | AST-SL1-R0744 | `MP-R0742.BELYY.H-130` |
| 615 | AST-SL1-R0745 | `MP-R0742.BELYY.H-140` |
| 616 | AST-SL1-R0746 | `MP-R0742.BELYY.H-150` |
| 617 | AST-SL1-R0747 | `MP-R0742.MOLOCHNYY.H-110` |
| 618 | AST-SL1-R0748 | `MP-R0742.MOLOCHNYY.H-120` |
| 619 | AST-SL1-R0749 | `MP-R0742.MOLOCHNYY.H-130` |
| 620 | AST-SL1-R0750 | `MP-R0742.MOLOCHNYY.H-140` |
| 621 | AST-SL1-R0752 | `MP-R0742.ROZOVYY.H-110` |
| 622 | AST-SL1-R0753 | `MP-R0742.ROZOVYY.H-120` |
| 623 | AST-SL1-R0754 | `MP-R0742.ROZOVYY.H-130` |
| 624 | AST-SL1-R0755 | `MP-R0742.ROZOVYY.H-140` |
| 625 | AST-SL1-R0756 | `MP-R0742.ROZOVYY.H-150` |
| 626 | AST-SL1-R0762 | `MP-R0762.H-160` |
| 627 | AST-SL1-R0763 | `MP-R0762.H-170` |
| 628 | AST-SL1-R0764 | `MP-R0762.H-180` |
| 653 | AST-SL1-R0824 | `MP-R0824.SHAMPAN.H-110` |
| 654 | AST-SL1-R0825 | `MP-R0824.SHAMPAN.H-120` |
| 655 | AST-SL1-R0827 | `MP-R0824.SHAMPAN.H-140` |
| 656 | AST-SL1-R0828 | `MP-R0824.SHAMPAN.H-150` |
| 667 | AST-SL1-R0844, AST-SL1-R0849 | `MP-R0844.BELYY.H-120` |
| 668 | AST-SL1-R0845, AST-SL1-R0850 | `MP-R0844.BELYY.H-130` |
| 669 | AST-SL1-R0846, AST-SL1-R0851 | `MP-R0844.BELYY.H-140` |
| 670 | AST-SL1-R0847, AST-SL1-R0852 | `MP-R0844.BELYY.H-150` |
| 671 | AST-SL1-R0848, AST-SL1-R0853 | `MP-R0844.BELYY.H-160` |
| 672 | AST-SL1-R0854 | `MP-R0844.SHAMPAN.H-120` |
| 673 | AST-SL1-R0855 | `MP-R0844.SHAMPAN.H-130` |
| 674 | AST-SL1-R0856 | `MP-R0844.SHAMPAN.H-140` |
| 675 | AST-SL1-R0857 | `MP-R0844.SHAMPAN.H-150` |
| 676 | AST-SL1-R0858 | `MP-R0844.SHAMPAN.H-160` |
| 677 | AST-SL1-R0859 | `MP-R0859.BELYY.H-120` |
| 678 | AST-SL1-R0861 | `MP-R0859.BELYY.H-140` |
| 679 | AST-SL1-R0862 | `MP-R0859.BELYY.H-150` |
| 680 | AST-SL1-R0864 | `MP-R0859.ROZOVYY.H-120` |
| 681 | AST-SL1-R0865 | `MP-R0859.ROZOVYY.H-130` |
| 682 | AST-SL1-R0866 | `MP-R0859.ROZOVYY.H-140` |
| 683 | AST-SL1-R0867 | `MP-R0859.ROZOVYY.H-150` |
| 684 | AST-SL1-R0868 | `MP-R0859.ROZOVYY.H-160` |
| 685 | AST-SL1-R0869 | `MP-R0859.SHAMPAN.H-120` |
| 686 | AST-SL1-R0870 | `MP-R0859.SHAMPAN.H-130` |
| 687 | AST-SL1-R0871 | `MP-R0859.SHAMPAN.H-140` |
| 688 | AST-SL1-R0872 | `MP-R0859.SHAMPAN.H-150` |
| 689 | AST-SL1-R0873 | `MP-R0859.SHAMPAN.H-160` |
| 692 | AST-SL1-R0879 | `MP-R0879.H-110` |
| 693 | AST-SL1-R0880 | `MP-R0879.H-120` |
| 694 | AST-SL1-R0881 | `MP-R0879.H-130` |
| 695 | AST-SL1-R0882 | `MP-R0879.H-140` |
| 696 | AST-SL1-R0883 | `MP-R0879.H-150` |
| 734 | AST-SL1-R0904 | `MP-R0904.FIOLETOVYY.H-110` |
| 735 | AST-SL1-R0905 | `MP-R0904.FIOLETOVYY.H-120` |
| 736 | AST-SL1-R0906 | `MP-R0904.FIOLETOVYY.H-130` |
| 737 | AST-SL1-R0907 | `MP-R0904.FIOLETOVYY.H-140` |
| 738 | AST-SL1-R0908 | `MP-R0904.FIOLETOVYY.H-150` |
| 739 | AST-SL1-R0911 | `MP-R0911.BELYY.H-130` |
| 740 | AST-SL1-R0913 | `MP-R0911.BELYY.H-150` |
| 741 | AST-SL1-R0914 | `MP-R0911.BELYY.H-160` |
| 742 | AST-SL1-R0918 | `MP-R0911.GOLUBOY.H-140` |
| 743 | AST-SL1-R0919 | `MP-R0911.GOLUBOY.H-150` |
| 744 | AST-SL1-R0923 | `MP-R0911.ROZOVYY.H-130` |
| 745 | AST-SL1-R0924 | `MP-R0911.ROZOVYY.H-140` |
| 746 | AST-SL1-R0925 | `MP-R0911.ROZOVYY.H-150` |
| 747 | AST-SL1-R0926 | `MP-R0911.ROZOVYY.H-160` |
| 748 | AST-SL1-R0927 | `MP-R0927.FIOLETOVYY.H-100` |
| 749 | AST-SL1-R0928 | `MP-R0927.FIOLETOVYY.H-110` |
| 750 | AST-SL1-R0929 | `MP-R0927.FIOLETOVYY.H-120` |
| 751 | AST-SL1-R0930 | `MP-R0927.FIOLETOVYY.H-80` |
| 752 | AST-SL1-R0931 | `MP-R0927.FIOLETOVYY.H-90` |
| 753 | AST-SL1-R0932 | `MP-R0932.ROZOVYY.H-100` |
| 754 | AST-SL1-R0933 | `MP-R0932.ROZOVYY.H-110` |
| 755 | AST-SL1-R0935 | `MP-R0932.ROZOVYY.H-80` |
| 756 | AST-SL1-R0936 | `MP-R0932.ROZOVYY.H-90` |
| 757 | AST-SL1-R0937 | `MP-R0937.H-110` |
| 758 | AST-SL1-R0938 | `MP-R0937.H-120` |
| 759 | AST-SL1-R0939 | `MP-R0937.H-130` |
| 760 | AST-SL1-R0940 | `MP-R0937.H-140` |
| 761 | AST-SL1-R0941 | `MP-R0937.H-150` |
| 771 | AST-SL1-R0948 | `MP-R0948.GOLUBOY.H-90` |
| 780 | AST-SL1-R0959 | `MP-R0959.BELYY.H-80` |
| 974 | AST-SL1-R1017 | `MP-R1017.O-1` |
| 975 | AST-SL1-R1018 | `MP-R1017.O-2` |
| 976 | AST-SL1-R1019 | `MP-R1017.O-3` |
| 977 | AST-SL1-R1020 | `MP-R1017.O-4` |
| 978 | AST-SL1-R1021 | `MP-R1017.O-5` |
| 979 | AST-SL1-R1022 | `MP-R1022.O-1` |
| 980 | AST-SL1-R1023 | `MP-R1022.O-2` |
| 981 | AST-SL1-R1024 | `MP-R1022.O-3` |
| 982 | AST-SL1-R1025 | `MP-R1022.O-4` |
| 983 | AST-SL1-R1026 | `MP-R1022.O-5` |
| 984 | AST-SL1-R1027 | `MP-R1022.O-6` |
| 815 | AST-SL1-R1042 | `MP-R1042.BELYY.H-110` |
| 816 | AST-SL1-R1043 | `MP-R1042.BELYY.H-120` |
| 817 | AST-SL1-R1044 | `MP-R1042.BELYY.H-130` |
| 836 | AST-SL1-R1070 | `MP-R1070.H-100` |
| 837 | AST-SL1-R1071 | `MP-R1070.H-110` |
| 838 | AST-SL1-R1072 | `MP-R1070.H-120` |
| 839 | AST-SL1-R1073 | `MP-R1070.H-130` |
| 818 | AST-SL1-R1096 | `MP-R1042.ROZOVYY.H-130` |
| 852 | AST-SL1-R1107 | `MP-R1107.H-90` |
| 853 | AST-SL1-R1108 | `MP-R1108.H-120` |
| 991 | AST-SL1-R1110 | `MP-R1110.H-110` |
| 992 | AST-SL1-R1111 | `MP-R1110.H-120` |
| 82 | AST-SL1-R1126 | `MP-R1126.ONE` |
| 83 | AST-SL1-R1127 | `MP-R1127.ONE` |
| 84 | AST-SL1-R1128 | `MP-R1128.ONE` |
| 1044 | AST-SL1-R1129 | `MP-R1129.DIM-20-10` |
| 1043 | AST-SL1-R1130 | `MP-R1129.ZELENYY.DIM-13-8` |
| 1045 | AST-SL1-R1131 | `MP-R1131.ONE` |
| 1003 | AST-SL1-R1133 | `MP-R1133.ONE` |
| 1004 | AST-SL1-R1134 | `MP-R1134.ONE` |
| 1005 | AST-SL1-R1135 | `MP-R1135.ONE` |
| 85 | AST-SL1-R1136 | `MP-R1136.ONE` |
| 86 | AST-SL1-R1137 | `0215.ONE` |
| 87 | AST-SL1-R1138 | `0216.ONE` |
| 88 | AST-SL1-R1139 | `MP-R1139.ONE` |
| 1034 | AST-SL1-R1140 | `MP-R1140.ONE` |
| 1020 | AST-SL1-R1141 | `MP-R1141.ONE` |
| 1046 | AST-SL1-R1142 | `MP-R1142.ONE` |
| 1027 | AST-SL1-R1143 | `MP-R0102.ROZOVYY.ONE` |
| 19 | AST-SL1-R1144 | `MP-R1144.ONE` |
| 1047 | AST-SL1-R1145 | `MP-R1145.ONE` |
| 143 | AST-SL1-R1146 | `MP-R1146.D-2` |
| 144 | AST-SL1-R1147 | `MP-R1146.D-3` |
| 145 | AST-SL1-R1148 | `MP-R1146.D-4` |
| 146 | AST-SL1-R1149 | `MP-R1146.D-5` |
| 142 | AST-SL1-R1150 | `MP-R1146.D-1` |
| 20 | AST-SL1-R1153 | `MP-R1153.PO-1000.ONE` |
| 21 | AST-SL1-R1154 | `MP-R1153.PO-2000.ONE` |
| 22 | AST-SL1-R1155 | `MP-R1153.PO-2500.ONE` |
| 24 | AST-SL1-R1156 | `MP-R1153.PO-3500.ONE` |
| 23 | AST-SL1-R1157 | `MP-R1153.PO-3000.ONE` |
| 127 | AST-SL1-R1160 | `MP-R1160.ONE` |
| 126 | AST-SL1-R1161 | `MP-R1161.ONE` |
| 889 | AST-SL1-R1163 | `MP-R1163.CHERNYY.ONE` |
| 890 | AST-SL1-R1164 | `MP-R1164.ONE` |
| 128 | AST-SL1-R1165 | `MP-R1165.ROZOVYY.ONE` |
| 129 | AST-SL1-R1166 | `MP-R1165.SERYY.ONE` |
| 130 | AST-SL1-R1167 | `MP-R1165.CHERNYY.ONE` |
| 133 | AST-SL1-R1170 | `MP-R1170.ONE` |
| 137 | AST-SL1-R1171 | `MP-R1171.MOLOCHNYY.ONE` |
| 134 | AST-SL1-R1172 | `0011.ONE` |
| 131 | AST-SL1-R1173 | `MP-R1173.ROZOVYY.ONE` |
| 135 | AST-SL1-R1174 | `MP-R1171.GOLUBOY.ONE` |
| 136 | AST-SL1-R1175 | `MP-R1171.KRASNYY.ONE` |
| 138 | AST-SL1-R1176 | `MP-R1171.ROZOVYY.ONE` |
| 139 | AST-SL1-R1177 | `MP-R1171.CHERNYY.ONE` |
| 132 | AST-SL1-R1178 | `MP-R1173.CHERNYY.ONE` |
| 140 | AST-SL1-R1179 | `MP-R1179.MOLOCHNYY.ONE` |
| 141 | AST-SL1-R1180 | `MP-R1179.CHERNYY.ONE` |
| 1021 | AST-SL1-R1182 | `MP-R1182.ONE` |
| 878 | AST-SL1-R1183 | `0219.O-10` |
| 874 | AST-SL1-R1187 | `MP-R1187.O-3` |
| 875 | AST-SL1-R1189 | `MP-R1187.O-5` |
| 876 | AST-SL1-R1191 | `MP-R1187.O-7` |
| 870 | AST-SL1-R1194 | `MP-R1194.ONE` |
| 882 | AST-SL1-R1198 | `0219.ONE` |
| 90 | AST-SL1-R1199 | `MP-R1199.ONE` |
| 1022 | AST-SL1-R1200 | `MP-R1200.ONE` |
| 341 | AST-SL1-R1201 | `MP-R1201.ONE` |
| 269 | AST-SL1-R1292 | `MP-R1292.BELYY.EU-17` |
| 270 | AST-SL1-R1293 | `MP-R1292.ROZOVYY.EU-17` |
| 273 | AST-SL1-R1307 | `0160.EU-26` |
| 290 | AST-SL1-R1333 | `MP-R1333.EU-28` |
| 91 | AST-SL1-R1334 | `MP-R1334.ONE` |
| 92 | AST-SL1-R1335 | `MP-R1335.ONE` |
| 93 | AST-SL1-R1336 | `0226.ONE` |
| 1023 | AST-SL1-R1337 | `MP-R1337.ONE` |
| 1048 | AST-SL1-R1338 | `MP-R1338.ONE` |
| 1049 | AST-SL1-R1339 | `MP-R1339.ONE` |
| 1024 | AST-SL1-R1340 | `MP-R1340.ONE` |
| 855 | AST-SL1-R1341 | `MP-R1341.ONE` |
| 25 | AST-SL1-R1342 | `MP-R1342.ONE` |
| 26 | AST-SL1-R1343 | `MP-R1343.PO-1000.ONE` |
| 94 | AST-SL1-R1344 | `0165.ONE` |
| 1050 | AST-SL1-R1349 | `MP-R1349.DIM-60-120` |
| 1051 | AST-SL1-R1350 | `MP-R1349.DIM-60-140` |
| 1052 | AST-SL1-R1351 | `MP-R1349.DIM-60-80` |
| 1053 | AST-SL1-R1352 | `MP-R1352.ONE` |
| 899 | AST-SL1-R1353 | `MP-R1353.EU-23` |
| 900 | AST-SL1-R1354 | `0001.EU-22` |
| 904 | AST-SL1-R1370 | `MP-R1370.EU-30` |
| 854 | AST-SL1-R1386 | `MP-R1386.ONE` |
| 27 | AST-SL1-R1387 | `MP-R1387.ONE` |
| 95 | AST-SL1-R1388 | `MP-R1388.ONE` |
| 96 | AST-SL1-R1389 | `MP-R1389.ONE` |
| 97 | AST-SL1-R1390 | `MP-R1390.ONE` |
| 101 | AST-SL1-R1391 | `MP-R1391.ONE` |
| 98 | AST-SL1-R1392 | `MP-R1392.KRASNYY.ONE` |
| 99 | AST-SL1-R1393 | `MP-R1392.MOLOCHNYY.ONE` |
| 100 | AST-SL1-R1394 | `MP-R1392.CHERNYY.ONE` |
| 102 | AST-SL1-R1397 | `MP-R1397.BELYY.ONE` |
| 103 | AST-SL1-R1399 | `MP-R1399.ONE` |
| 106 | AST-SL1-R1400 | `MP-R1400.AYVORI.ONE` |
| 107 | AST-SL1-R1401 | `MP-R1400.KORICHNEVYY.ONE` |
| 104 | AST-SL1-R1402 | `MP-R1402.ONE` |
| 105 | AST-SL1-R1403 | `MP-R1403.ONE` |
| 1035 | AST-SL1-R1442 | `MP-R1442.ONE` |
| 355 | AST-SL1-R1458 | `MP-R1458.ONE` |
| 356 | AST-SL1-R1459 | `MP-R1459.G-36` |
