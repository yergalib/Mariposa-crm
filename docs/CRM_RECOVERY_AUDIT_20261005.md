# CRM1.0: восстановленный review-кандидат

Срез GitHub проверен 05.10.2026 через `git ls-remote`, fetch и API открытых PR.
Локальная основа: `07ea3e8c72fb4e10142a00dd9b8c8f98106cd8b8`, ветка
`review/crm-1-0-release-candidate`. Старые задачи не восстанавливались.
Этот документ актуализирует исторические статусы MASTER_ROADMAP и CRM_1_0_STATUS;
готовность к Production не заявляется.

## Источник истины и сохранение результатов

- GitHub main: `9f1a8488ca0f932cbd7ccdf500baae15208620a7`.
- GitHub CRM Preview: `7607731e23c1efa9b5ef34c2367e5201e8b4bfe8`.
- GitHub сайт: `a5668e8a6aedb58beb32b5d0f4da04486bce439c`, 142 коммита поверх main.
- PR #1: draft, `review/mobile-scanning-foundation-1f` → main,
  head `c6582a0917dbfbacd33f4a52bea82787cccff56d`.
- PR #2: draft, `review/pilot-preview-rollout` → `review/next-block`.
  Это PILOT/site PR, а не Production-кандидат CRM.
- Кандидата `07ea3e8` не было среди удалённых heads. Он подтверждён в указанном
  Windows checkout, с чистым рабочим деревом. Создана независимая копия Git без
  hardlinks; старые worktrees, их незакоммиченные изменения и node_modules не менялись.
- Локальные origin/*, скопированные из старого checkout, сами по себе не считаются
  GitHub-ветками. Проверенный полный remote inventory приведён ниже.

Кандидат содержит 7607731 и ранее подготовленные a511e07/07ea3e8: CRM query/scope,
клиенты, документы, отчёт закупок, аудит, policy и UI reversal. Auth/session/db/proxy
совпадают с main. Это намеренно отдельный CRM-кандидат: showroom/AI из Preview
в нём отсутствуют. Их исходники сохранены в GitHub site-ветке; заменять ею этот
кандидат или считать публичные endpoints кандидата работающими нельзя.

## Единая классификация roadmap

ГОТОВО означает реализацию в коде review-кандидата с указанным уровнем проверки,
а не live выпуск. ЧАСТИЧНО означает конкретный оставшийся пробел. НЕ ГОТОВО
используется для отсутствующей реализации; БЛОКЕР CRM1.0 — для необходимого решения
или разрешения, которое нельзя заменить догадкой или локальным тестом.

| Направление | Статус | Фактическое основание / граница |
| --- | --- | --- |
| Аренда/продажа, предоплата/доплата, долг, способы оплаты | ГОТОВО (код) | finance/effects, order-payments, payment-methods, sales/handover; обязательные tenant/branch/customer/order и actor; сохранённые SQL-тесты оплаты и выдачи |
| Залог, возврат денег/залога, удержание, ущерб | ГОТОВО (код) | order-deposits, order-damage, order-settlement, immutable ledger; залог не оплачивает долг автоматически; полный damage/browser цикл не подтверждён |
| Отмена и корректировка | ГОТОВО (код) | order/sale lifecycle и canonical reversal; отдельная scoped форма с причиной/подтверждением, idempotency и запретом зависимых effects; исходная операция не переписывается |
| Отдельный штраф, включая просрочку | НЕ ГОТОВО / согласованно вне CRM1.0 | Владелец 05.10.2026 в 17:08 UTC согласовал исключение отдельных штрафов из CRM1.0. Реализованный учёт ущерба и удержаний сохраняется. Отсутствие penalty implementation больше не блокирует CRM1.0 |
| Продавец/директор, видимость финансов | ГОТОВО (код), ЧАСТИЧНО (приёмка) | registry/effective, read-visibility, scope/exports; DENY проверен сохранённым браузерным сценарием; полной security E2E матрицы нет |
| Филиалы, остатки, каталог/размеры/штрихкоды/экземпляры | ГОТОВО (принятая основа) | branch-access, inventory, stocktake/scanning, BULK без фиктивных instances; FOUNDATION-1D/Stage8B не переписаны |
| Правила аренды/продажи/публикации по исполнению | ГОТОВО (код), БЛОКЕР CRM1.0 (live) | operation-policy и guard, SQL миграция 20261005100000; применение live не разрешено; старые writers должны быть закрыты |
| Заказ → резерв → выдача → частичный/полный возврат | ГОТОВО (код), ЧАСТИЧНО (приёмка) | management/fulfillment/returns; сохранённые SQL rental/sale циклы; физический iPhone и полная гонка всех writers не подтверждены |
| Клиенты | ГОТОВО (ядро), ЧАСТИЧНО (история взаимодействий) | контакты, дубли, scoped заказы/финансы/документы/OrderEvent; Inquiry не связан автоматически с Customer/Order |
| Документы/печать | ЧАСТИЧНО | сохранённые unsigned rental snapshots и A4 PDF проверены; отдельные sale/withholding документы и физическая печать не подтверждены |
| Финансовая сводка/выгрузки/закупки | ГОТОВО (базовые), ЧАСТИЧНО (расширенные) | finance/dashboard и scoped XLSX, rental/sale accrual отдельно, purchase report; utilization/idle, AOV и полный аналитический набор не завершены, сейчас не расширялись |
| Общий API для сайта/WA/TG | ЧАСТИЧНО | общие availability/catalog/policy/inquiry сервисы и внутренний WhatsApp lookup; versioned staff API и channel delivery отсутствуют; public showroom endpoints находятся в отдельной замороженной site-ветке |
| Сайт, карусели, AI/ассистенты | НЕ ГОТОВО в этом кандидате / вне текущего объёма | отдельная site-ветка сохранена без изменений; её выпуск и развитие не выполнялись |
| Полный Excel владельца | ГОТОВО (подготовка), БЛОКЕР CRM1.0 (применение) | manifest/full runner и full-schema rehearsal сохранены; это не RemOnline import; price-only не используется |
| Live schema/data cutover и Production | БЛОКЕР CRM1.0 | отдельное разрешение, свежий backup/preflight, old-writer barrier/drain, закрытие skew-pinned старых версий и явное разрешение promotion |

## Доказательства и ограничения

Сохранённый `crm-unified-release-candidate-20261005.json` указывает точный 07ea3e8.
В этом восстановлении повторно сверены SHA-256 всех шести перечисленных в нём
файлов: browser result, два PDF и три E2E harness. Все совпали. Ранее записанные
результаты 5/5 SQL finance, 5/5 SQL operations, 9/9 browser и 11/11 полного workbook
rehearsal переиспользуются как сохранённые доказательства, не как новый запуск.
Браузер — Chrome 390px, не физический iPhone; PDF не доказывает физическую печать.
Synthetic DB и полная схема не доказывают Production application-role/RLS.

Финальные локальные проверки восстановления записаны в соседнем `evidence/`:
13 synthetic regression suites — 125/125 плюс 432 policy combinations; Prisma
generate, Next typegen, `tsc --noEmit`, optimized Next build — PASS. Сборка выполнена
с фиктивным `127.0.0.1:1` DB URL и пустыми Storage credentials. Общий набор пройден
один раз; только упавший order-list harness повторён после исправления allowlist
для реального чистого `operation-policy.ts`, добавленного исходным кандидатом.
Бизнес-код при восстановлении не менялся. Diff check — PASS.
Ни production .env, ни секреты, ни backup rows, ни synthetic credentials не входят
в Git. Live Supabase, Vercel settings, Storage и main не изменялись.

## Конкретные условия следующего решения владельца

Решение владельца 05.10.2026 17:08 UTC: «да» на предложение исключить отдельные
штрафы из CRM1.0, сохранив существующий учёт ущерба и удержаний. Передано родителем
задачи; это не разрешение на Production, миграции, полный Excel или security changes.
Новых функций и повторного прогона тестов для этой документационной правки нет.

Оставшиеся release gates:

1. Для live cutover закончить загрузку фото, выбрать окно и уполномочить администратора
   доказать блокировку всех старых write-entrypoints/jobs и drain, включая старые
   deployment URL и skew-pinned запросы. Само включение Standard Protection этого не доказывает.
2. В этом окне отдельно согласовать точные schema/import hashes и свежий backup,
   полный Excel import с preflight; не blanket migrate deploy и не повтор Stage8B.
3. На согласованном окружении принять роли продавца/директора, физический iPhone
   find/customer/payment/issue/return, damage/withhold/refund и печать. Затем отдельно
   разрешить merge/promotion. Нынешняя подготовка review не является этим разрешением.

Следующее одно согласование: после завершения загрузки фото согласовать окно и
ответственного администратора для проверки плана остановки старых writers и drain,
с перечнем entrypoints/jobs, критериями проверки и откатом. Сначала представить
конкретный план и границы live-действий на утверждение; это согласование само по
себе не разрешает schema/import, security changes или Production promotion.

## Полный проверенный GitHub inventory

| Ветка | HEAD |
| --- | --- |
| main | 9f1a8488ca0f932cbd7ccdf500baae15208620a7 |
| review/catalog-pilot-ux-1 | 8917845ed8a95f0da886bf0df786e2113deb2106 |
| review/crm-inquiry-reply-contact | 32725ad220f3a31fce9c1f5eb4c17d8c2c4b561a |
| review/crm-safe-preview-integration | 7607731e23c1efa9b5ef34c2367e5201e8b4bfe8 |
| review/database-connection-stability | 4b544f85c047f4c8b2c49b5ebbc908bf30e70159 |
| review/mobile-foundation-1a-hotfix | 9150c9128062f9b29051136596336c0ac38032b8 |
| review/mobile-scanning-foundation-1b | 482f8748b686138745f679e3ff9e322477845a28 |
| review/mobile-scanning-foundation-1c | 26e9ab9ef9a025b397806e6dda2b226c4e807e4b |
| review/mobile-scanning-foundation-1d | 4cca8549e213935de31833e311db0cb124c051aa |
| review/mobile-scanning-foundation-1e | f57bedf15f78dedeb5d97d1ee246f471b1f91e8c |
| review/mobile-scanning-foundation-1f | c6582a0917dbfbacd33f4a52bea82787cccff56d |
| review/next-block | 0a4705485a386efccd047b9b68e5d60b59dba221 |
| review/pilot-preview-rollout | a5668e8a6aedb58beb32b5d0f4da04486bce439c |
| review/sale-3-employee-flow | 9f1a8488ca0f932cbd7ccdf500baae15208620a7 |
