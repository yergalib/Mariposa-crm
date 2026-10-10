# Локальный кандидат CRM + website

Исходники: CRM `c6cfafc5e5d7ee95a96528d3136fc9a9360a2973` + website `fceb7cb4045a2d45f0a1d2d9305f958605ddb5b1`. Ветка `review/crm-website-integrated-20261010`. Это подготовка к отдельному разрешению публикации, не выполненный релиз.

Единственное пересечение — `prisma/schema.prisma`. Сохранены LoginAttemptBucket, модели assistant history/provider и обе группы связей. Бизнес-код родителей не менялся. Два устаревших website-теста приведены к уже принятому контракту (`price: null`, цена в AssistantProductCard вместо удалённого verifiedReply).

## Проверено локально

- Объединённая схема валидна, Prisma-клиент сгенерирован и читает все добавленные модели.
- Две новые синтетические БД: все 7 миграций; отдельно только 5 CRM. Исторические количества записей, остатки, суммы ledger/cash и количество audit-записей сохранены.
- 36 групп реальных DB-тестов: sale return, supplier return, C1–C8, C5 pool=2. Девять offline-наборов website/CRM, включая 6 групп orders workspace.
- Один финальный typecheck/lint/build. Ошибок нет; 7 прежних lint-предупреждений. Повторные точечные прогоны потребовались только двум исправленным тестам.
- Реальный собранный HTTP-сервер на CRM-only базе без assistant-таблиц: showroom/login 200, orders redirect на login, history/intake 503, assistant ранний отказ 403. Отдельно service gates assistant/provider/history отказали до DB/network; intake проверен до payload/DB.
- Платных API-вызовов — 0. Модель в offline-тестах заменена scripted-ответами. Нативный iPhone и live нагрузка повторно не проверялись.

## Семь добавленных миграций относительно общего предка

Это список Git-кандидата, **не фактический pending-список live БД**. Live БД и её migration history не читались.

| Группа | Каталог миграции | Назначение |
|---|---|---|
| CRM 1 | `20261010100000_sale_return_kind` | Enum SALE_RETURN |
| CRM 2 | `20261010100100_sale_return_integrity` | Поля/ограничения/защита истории возврата продажи |
| CRM 3 | `20261010110000_supplier_return_kind` | Enums SUPPLIER_RETURN и RETURNED_TO_SUPPLIER |
| CRM 4 | `20261010110100_supplier_return_integrity` | Поля/ограничения возврата поставщику |
| CRM 5 | `20261010150000_login_attempt_limits` | Общие счётчики входа, узкое исключение global auth audit |
| Assistant A | `20261010150000_assistant_history` | History/messages/quotas; отдельно gated |
| Assistant B | `20261010200000_assistant_provider_budget` | Durable metadata лимита вызовов; отдельно gated |

Сохранять полные имена и SQL/checksums. В полном лексикографическом порядке Assistant A идёт перед CRM 5 (одинаковый временной префикс не означает одинаковое имя), Assistant B — последняя. Enum-миграции должны закоммититься до связанных integrity-миграций: не оборачивать весь набор в одну внешнюю транзакцию. Репетиция применяла каждый SQL-файл отдельной транзакцией в точном порядке.

## Checklist перед отдельным разрешённым релизом

1. Зафиксировать точный SHA кандидата, реально развёрнутый SHA и резервную копию/проверенный путь восстановления. После отдельного разрешения read-only сверить фактическую migration history и schema целевой БД. Не выводить pending из Git diff.
2. Выбрать область релиза и миграций. Для полного CRM-кода нужна соответствующая CRM-схема, в частности login_attempt_buckets: отсутствие таблицы закрывает вход. Учесть DDL locks, проверку constraints на реальных объёмах и необходимое окно; локальные синтетические тесты не заменяют эту оценку.
3. Сохранить `MARIPOSA_ASSISTANT_ENABLED=0` (или отсутствие), `PROVIDER_BUDGET_OPEN=false`, `HISTORY_OPEN=false`, `PUBLIC_INQUIRY_INTAKE_OPEN=false`. Ключи/платный smoke не нужны. Не запускать bundled AI smoke launchers. Открытие каждого gate — отдельное решение.
4. Учесть отдельный gate: текущий showroom service запрещает `VERCEL_ENV=production`; публикация этого SHA сама по себе не открывает production-витрину. Локальный HTTP smoke использовал синтетический storefront и preview-режим.
5. После отдельно одобренной публикации проверить login, branch scope, read-only catalogue, закрытые endpoints и отсутствие непредусмотренных записей. Запись реальных тестовых заказов/денег не входит в этот checklist без отдельного разрешения.

## UI-only и assistant migrations

**На уровне runtime их можно отложить**: готовый общий build проверен на CRM-only БД, где assistant-таблиц вообще нет. Условия — все gates OFF и наличие требуемой CRM-схемы. Объединённый кандидат целиком не является чисто UI-патчем: он содержит CRM/auth изменения.

Обычный `prisma migrate deploy` из полного checkout применит все фактически pending миграции, включая обе assistant; feature gates не управляют мигратором. Поэтому UI-only публикация не должна автоматически запускать эту команду из полного набора. Если CRM-миграции уже применены, возможен code-only deploy без запуска мигратора. Если ещё нужны CRM-миграции, требуется отдельный явно утверждённый selective migration artifact/процедура с исходными именами и checksum и учётом только реально выполненных SQL. Такой deployment workflow и live history здесь не проверялись.

Не удалять/переименовывать assistant-папки в общей ветке, не переписывать применённые SQL и не использовать fake `resolve --applied` для пропуска. Отложенные миграции остаются в общей истории и реально pending до отдельного разрешения. Применение assistant DDL также само по себе не включает функцию.

## Rollback

Сначала закрыть gates и остановить дальнейшие изменения данных. Откатывать код только на заранее зафиксированный, совместимый с фактической БД релиз; `c6cfafc` — локальный CRM reference, не утверждение о текущем live SHA. После появления новых return enum-значений и записей нельзя считать произвольный старый Prisma-клиент совместимым.

Добавленные таблицы/колонки/enums обычно оставить на месте при code rollback; не удалять ledger, возвраты или audit и не выполнять слепые down migrations. Сужение nullable audit tenant и удаление login-таблицы требуют отдельного плана данных. Восстановление backup может терять записи после его создания и требует отдельного решения. Ни rollback, ни deploy в этой задаче не выполнялись.

Машиночитаемые результаты и SQL hashes: `CRM_WEBSITE_INTEGRATION_EVIDENCE_20261010.json`.
