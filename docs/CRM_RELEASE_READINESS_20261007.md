# CRM 1.0 — release readiness / точный план, 7 октября 2026

## Кандидат и область

Единственная ветка: `review/crm-1-0-release-candidate`, существующий draft PR #3: https://github.com/yergalib/Mariposa-crm/pull/3. База приложения — `b79550e7d82410f4e4cae976ff70f1152833209b`. Точный новый SHA коммита с этим документом записывается после commit в `../release-readiness-20261007/release-manifest.json`; исполнять выпуск можно только по этому SHA, не по подвижному имени ветки.

Единственное изменение к b79550e — закрытие двух новых таблиц примерок по существующему образцу `inquiries`: RLS включён, все права PUBLIC/anon/authenticated отозваны. Новых функций, изменений Core, stocktake, print или схемы бизнеса нет. Миграция ещё не применена в live, поэтому поправлен её существующий файл; прежний checksum в старых evidence не переписывается. Старые synthetic-клоны не переобозначать как применившие новую версию.

**Release SQL:** `prisma/migrations/20261006150000_crm_p0_fittings/migration.sql`.
**Единственная новая миграция:** `20261006150000_crm_p0_fittings`.
**Новый SHA-256:** `7510499bf7ca0f499a3e42b993cebaf64650da4569bea5fbf3d25ada72e381e6`.
**Старый исторический SHA-256:** `6978c759a2390115111ef2b1163ce9ebfccc526cd70f5b940a8e66c44bfb0adf` — для выпуска больше не использовать.

Цели: Supabase Main `jawposhuxaexoqzopgoq`, существующий Vercel `prj_FSsQxUktUBH9VNCGeadBoNnzlD1W` / `mariposa-crm`. Все Vercel MCP вызовы строго без teamId и slug. Никаких новых проектов, Transfer, переподключений, смены секретов, повторного импорта или price-only.

## Employee path: закрыт имеющимися доказательствами

| Шаг сотрудника | Уже имеющееся доказательство | Граница |
| --- | --- | --- |
| Создать/изменить обращение, контакт, товары, сотрудника, срок | p0-closure-browser: история; p0-workflow: final selection/version; overnight: сохранение полей при ошибке | История задним числом не создаётся |
| Перейти в примерку и обратно | overnight journey 1: связанный клиент, контакт, товары, допустимый assignee, Cancel без записи | Новый гость ещё требует карточку клиента для заказа |
| Выбрать слот, изменить/отметить прибытие, завершить/no-show | p0-workflow 11/11: overlap/concurrency/adjacent/version/lifecycle; p0-browser: actual SELLER ARRIVED; fitting-form-state: ошибки/повтор | Полный браузерный прогон каждого статуса не заявляется; сервисные проверки сохранены |
| Календарь/ответственный | calendar branch timezone 5/5 + calendar browser + closure browser filters | Chrome, не физический iPhone |
| Конвертировать в заказ | overnight journey 1 + final-flows: клиент, даты, товары, сотрудник, обе связи и история, один idempotent draft без резерва | Только RENTAL; продажа — принятый отдельный Core |
| Резерв/подтверждение/оплата, выдача/возврат/урегулирование | overnight payment + прежний полный BULK browser; SERIALIZED/BULK damage evidence | Не повторялось ради счётчика |
| Документ/печать, права | overnight document/PDF/stale revision; customer-documents; scope-ready 404/OWNER control, 403 export | Физическая печать остаётся прежним принятым результатом |

Непокрытого существенного перехода в этом employee path не найдено. Семь готовых browser flows не повторялись. После фактического изменения SQL выполнены 7 targeted PostgreSQL assertions в отдельном кластере 62351 и один новый агрегат 19/19: 15 regression suites, full lint, typegen, full typecheck, production build (webpack). ACL/RLS проверены также с временным GRANT внутри откатываемой тестовой транзакции; прямые чтение и INSERT всё равно закрыты. Отпечатки склада, фото и ledger не изменились. Полный lint: 0 errors, те же 7 warnings.

## Свежий read-only preflight

- На 2026-10-07 03:04–03:09 UTC primary alias через Vercel metadata разрешается в `dpl_2UiZa6Yvgs3yu1AGUM9w9CHcV3ZS`, SHA `fe813f18f591ed1f53ce211e1a9be43d1d8c7916`, READY. Обе основные aliases присутствуют. Последний Preview — `dpl_AFUK59chLaj8GfHqXCqBdtxCds65`; его нельзя считать изолированной от live проверочной базой.
- Main PostgreSQL 17.6. 46 migration-history записей: 45 завершённых, одна историческая rolled-back попытка; незавершённых без rollback нет. Последняя завершённая — `20261005100000_execution_operation_policy` с checksum `83982d50d9d2b61b929a2944daaaa18e18ce8baebff38810be56c96424ebab96`.
- `fittings`, `fitting_items`, три новых nullable column отсутствуют; InquiryStatus содержит только NEW/IN_PROGRESS/WAITING_CUSTOMER/CLOSED. **Кандидат до миграции публиковать на Main нельзя.**
- 44 завершённые migration checksums соответствуют локальным файлам с учётом LF/CRLF. Stage8B имеет историческое расхождение: Main `631cf2ada2a9e02389aaf0fdee151603e5bb16843d3e033c6979c0a59cb5eddb`; файл в кандидате идентичен файлу deployed SHA fe813f18. Это не новая правка. Не делать reset/repair/rewrite Stage8B и не запускать blanket migrate deploy.
- Два read-only наблюдения активности показали active=0, transactions=0, hidden=0. Они сделаны **без свежего подтверждённого writer barrier**, поэтому не являются drain proof и не разрешают DDL.
- Сохранённый backup/restore: snapshot 2026-10-06 05:34:02.550Z, verification 05:39:25.990Z, SHA-256 `0c8b2f4fae171c557fbc9a0da71eed5fa88a2d2843b6d304e143df6e20f1912b`, 61 tables/53 triggers, fingerprints/schema match. Он предшествует прошлому импорту и последующим операциям: **не свежий rollback point для этого выпуска**.
- Текущий all-writer barrier не подтверждён. Три GET probes /login не установили соединение из локального инструмента; это не 403 evidence и не доказательство остановки. Исторические WAF/drain attestation 6 октября не переиспользуются как текущие.

## Последовательность после передачи точного допуска

1. **Зафиксировать release bundle.** Передать родителю новый SHA, единственный SQL checksum, DB/project/aliases, перечень ниже. Отдельно зафиксировать разрешение на публикацию этой review-ветки/обновление PR, точную миграцию, staged Production и переключение aliases. Main merge не требуется для существующего branch release и сейчас не планируется. Неоднозначное разрешение не расширяет security scope.
2. **Отдельный security action.** На существующем проекте временно опубликовать существующее правило `MARIPOSA maintenance`: Request Path starts with `/`, Deny, все методы, без environment filter. Проверить охват текущих production aliases, unique старых Production/Preview URLs и showroom/API writers. Это проектный downtime; сайт тоже может быть закрыт на время окна. Автоматически не менять WAF/Protection/bypass/access/credentials. Owner/родитель должен отдельно согласовать именно этот action/target. Не открывать обходной URL/заголовок для тестов.
3. **Установить writer barrier и drain.** Подтвердить, что cron, WA/TG/webhooks, imports, локальные/другие direct DB writers остановлены либо отсутствуют. Зафиксировать UTC B последней полной проверки блокировки. Перепроверить фактический максимум D всех старых writers; прежние 300 секунд не считать вечной настройкой. После B+D получить два новых агрегатных pg_stat_activity наблюдения с разницей минимум 60 секунд: active=transactions=hidden=0, исключая observer. Idle допустим. При активности/скрытых состояниях/неполном охвате — STOP, не убивать чужие сессии и не подменять drain произвольным ожиданием.
4. **Свежий backup + restore proof.** Переиспользовать существующий `maintenance-backup.cjs` только с НОВЫМ актуальным gated request: identity, B/D, sample times и hashes, окно допуска. Проверить текущий digest самого launcher против reviewed версии; не запускать старый request. Выполнить согласованный consistent snapshot + pg_dump, восстановить в новом изолированном кластере и сопоставить counts/fingerprints/schema/constraints. Продолжать только после success=true и зафиксированного archive SHA. Public CRM — проверяемая граница восстановления; dump не содержит Storage bytes. Фото/Storage не перемещать и не удалять, текущие ссылки/метаданные сохранять. Старый Excel-import runner НЕ запускать.
5. **Последняя сверка перед DDL.** Под тем же barrier подтвердить identity Main, deployed SHA, отсутствие новой миграции/её объектов/частично применённого состояния, неизменность prerequisites и права backend DB role (как для уже закрытых inquiries). Подтвердить, что единственная разрешённая pending migration — fittings. Если изменилось что-либо из bundle — STOP и новый точный план, без blanket repair.
6. **Применить один SQL.** Проверить файл по SHA-256 выше; выполнить в одной транзакции с fail-fast lock timeout и ограниченным statement timeout (плановые 5s/60s, без автоматического продления), без бизнес-DML. В той же согласованной процедуре записать только новую migration-history запись с точным именем/checksum после успешного DDL; предыдущую историю не менять. При ошибке откатить транзакцию, сохранить barrier и диагностику, не делать слепой rerun. Новые Inquiry enum values использовать лишь после COMMIT.
7. **Post-migration read-only checks.** Обе таблицы/индексы/FK/check constraints существуют и валидны, RLS=true, PUBLIC/anon/authenticated не имеют прав. Три nullable column и три enum value присутствуют. Новые таблицы пустые, прежние бизнес-строки и counts сохранены; ledger/stock/photo fingerprints прежние. Проверить ровно одну завершённую новую migration-history запись. Если отличается — STOP под barrier.
8. **Публикация/сборка только точного SHA.** После отдельного допуска push только integration-ветки, без force/main merge; оставить её automatic-deploy disable. Проверить GitHub head и отсутствие непрошенных deployment. В существующем проекте подготовить staged Production build без назначения доменов; не публиковать локальный dummy-DB build как production artifact. Получить deployment ID, git SHA, READY и target=production. Не продвигать старый f33 Preview и не обходить прежний auto-review отказ. Проверка protected staging возможна лишь по отдельно разрешённому access path; если она требует изменения security — STOP и согласовать точное изменение.
9. **Переключение и открытие.** Только после проверок и конкретного допуска переключить aliases на проверенный staged production deployment. Подтвердить оба alias → ожидаемый ID/SHA. Снять/изменить maintenance rule только отдельным согласованным действием владельца/родителя; сохранить ограничение старых несовместимых Preview/writers. Не открывать сразу все старые deployment URLs. После открытия проверить login, свои/чужие branch scope и read-only страницы. Записи smoke в live — только по отдельно определённому допустимому сценарию, без фиктивных денежных операций и последующего удаления истории. Собрать runtime errors/SQL errors и текущий deployment ID. Это новая целевая release verification, не повтор всего локального regression.

## Rollback constraints

- До COMMIT миграции: rollback транзакции; old code/data остаются, barrier не снимать до проверки.
- После миграции, до новых workflow writes: старый artifact fe813f18 — лишь кандидат на app rollback. Сначала проверить его с аддитивной схемой и отсутствие новых enum usages; не гарантировать совместимость без этой проверки.
- После новых workflow writes: слепой app rollback опасен — старый клиент может не понимать SELECTION/FITTING/ORDER. Предпочтителен исправленный forward artifact, barrier остаётся до готовности. Новые таблицы/связи/enum values не удалять, историю не переписывать.
- Восстановление свежего backup после открытия теряет последующие записи. Оно требует отдельного плана reconciliation/разрешения, фиксации всех post-snapshot writes и запрета потери чужих данных. Не считать `vercel rollback` откатом базы.
- WAF/alias rollback не должен вновь открыть старые writers к новой схеме. Любой authorization denial — остановить соответствующий action и передать родителю точный target/reason, не искать обход.

## Итоговый gate

**Локальный кандидат готов; live release пока NO-GO по операционным prerequisites:** нет свежего подтверждённого all-writer barrier/drain и backup/restore для нового окна. Ручная UI-приёмка владельца не является блокером этого плана. Нового функционального P0 блокера после исправления SQL не осталось в проверенной области. Production/live/security изменений в этом проходе нет; 62340, 62350 и отказ Get-CimInstance не обходились.

Источники: предыдущие `CRM_P0_*` документы/evidence и `../maintenance-window-order.md`; fresh metadata/evidence в `../release-readiness-20261007/`. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) подтверждает необходимость защиты SQL-created tables; [PostgreSQL ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html) — использование нового enum после commit; [Vercel promotion](https://vercel.com/docs/deployments/promoting-a-deployment) — distinction staged Production/Preview.
