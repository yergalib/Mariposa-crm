# Полный Main import: отдельный закрытый по умолчанию runner

Подготовка, не разрешение live-операции. Продуктовый runtime не менялся.
`scripts/catalog-main-import.cjs` — новый отдельный вход; старый
`catalog-workbook-import.cjs` сохраняет проверки loopback, имени rehearsal-БД и
data_directory. Общий transactional executor вынесен без дублирования manifest.
Внешний старый `crm-price-audit/catalog-import-runner-candidate.cjs` не изменён.

## Зафиксированный объём

- Release приложения: `4aef8c35faa9c0e6de77f268b6bce232ccd562a4`, draft PR #3.
- Vercel: `prj_FSsQxUktUBH9VNCGeadBoNnzlD1W`, без teamId/slug.
- Main tenant: `2157bde1-1994-465b-9f80-e1b740ee3cb1`.
- Explicit endpoint profiles: original direct host `db.jawposhuxaexoqzopgoq.supabase.co:5432`, user `postgres`; or verified session host `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.jawposhuxaexoqzopgoq`. Both use database `postgres`. No wildcard or automatic fallback.
- Session profile requires absolute `MARIPOSA_IMPORT_CA_FILE` pointing to the public owner-provided certificate. Pinned DER SHA256: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`. TLS certificate and hostname verification stay enabled; no system trust installation.
- On 2026-10-06, an authorized read-only connection through that session host passed strict TLS and confirmed database/user postgres, expected Main organization, read_only=on and recovery=false. The direct hostname lookup failed earlier (ENOTFOUND). No live import or DDL was performed.
- Исходный полный manifest остаётся в `crm-price-audit/full-workbook-dryrun-20261005.json`.
  SHA256 `bef8eaf3e75db27fd166852951eb646d228b6b3f21e37f9e6052a5bfa20be821`.
- 444 группы / 1052 target variants / 330 моделей; 4915 → 4826 единиц,
  994 активных варианта, 1184 цены; отрицательные corrections -80/-9,
  канонические 14/4, доноры 0/0, size fix и execution/DIRECT flags.
  Только полный manifest; нет price-only/PILOT import или RemOnline переноса.

## Что доказано локально

Targeted boundary tests: 10/10 PASS. Новая собственная loopback-БД, schema-only
restore public из ранее проверенного backup, synthetic seed без реальных клиентов.
Проверены offline default, identity/confirmation/evidence gates, сохранение старого
guard, read-only preflight, schema/stock drift, rollback всех таблиц при истечении
разрешения перед COMMIT, rollback при неожиданном изменении фото, полный apply с
14/4 и нулевой replay, отказ replay при изменении цен или фото.

После этого усилено условие applicationTimestamp (внутри разрешённого окна,
не в будущем); повторены только 4 boundary/gate tests — PASS. SQL transaction core
после 10/10 не менялся. Общие 125 regression/typecheck/build не повторялись.
Evidence вне Git: `../import-test-runtime/result.json`, `gate-result.json`,
`targeted.log`, `gates.log`. Synthetic request/evidence не использовать в live.

Текущий digest двух исполняемых файлов (runner + transaction core, точные байты
в указанном порядке): `a46405b37e68d773d00a44490bb01111299ea5c02639d21860038ea90839a7a6`.
`--dry-run` выводит этот codeSha; изменение байтов, включая line endings, требует
повторной сверки, а не молчаливой подстановки нового hash в разрешение.

## Реальные STOP gates

1. Нет отдельного явного разрешения владельца на live scope/window — STOP.
2. Old-writer/WAF/barrier/skew coverage не доказан — STOP до DB writes. Скриншот
   Firewall Active / System Mitigations Active / Custom Rules 0 не является барьером.
   Должны быть закрыты все старые Preview/Production hosts, bypass/authorized callers,
   cron и внешние writers; harmless URL checks и logs должны подтвердить отсутствие
   вызовов старого кода, включая skew-pinned запросы. Сами locks импорта этого не заменяют.
3. Нет подтверждённого drain и свежего backup после него — STOP. Backup 07:40 UTC
   не принимается как текущий. Backup должен быть проверен восстановлением в отдельном
   закрытом окружении; DB dump не защищает Storage bytes. Фото выпуск не меняет.
4. Прямое подключение, TLS, Main identity, schema digest, baseline или manifest расходятся — STOP.
   Не менять credentials/SSL, не обходить ограничение через pooler/другой endpoint.
5. Timeout/deadlock/любая ошибка — rollback, без fallback/автоматического retry.
   При потере соединения на COMMIT результат может быть неизвестен: сначала read-only
   preflight с прежним applicationTimestamp и проверка marker, никогда новый timestamp.
6. Истекло окно (максимум 2 часа), backup старше часа или evidence bytes изменились — STOP.
   Проверка повторяется перед COMMIT. Это консервативные лимиты, не обещанная длительность окна.
7. Старый marker без preservationFingerprint требует review; его нельзя дополнять вручную.

Владелец сообщил, что фото/CRM не меняют и `@Mariposaastana_bot` только
зарегистрирован в BotFather, обработчик не запускался. Это контекст, не технический
барьер и не разрешение. Сайт frozen, отдельные штрафы исключены из CRM1.0.

## Команды подготовки без сети

Из корня checkout; не создавать копию manifest в Git:

```powershell
$manifestPath='C:/Users/Ameliestore/Documents/Codex/2026-10-01/task/crm-price-audit/full-workbook-dryrun-20261005.json'
node scripts/catalog-main-import.cjs --dry-run --manifest $manifestPath --at 2026-10-05T22:00:00.000Z
```

`--dry-run` (также режим по умолчанию) проверяет файл и план, не загружает `pg`,
не читает DB credentials и не открывает соединение. Здесь `--at` — только пример
для offline проверки, не согласованное время live-применения.

## Request без секретов, только после review

Сохранить вне Git, например в абсолютном пути `$requestPath`. Шаблон заведомо
не допускает apply: authorization/backup/barrier равны null, hash схемы нулевой.
`applicationTimestamp` выбрать один раз для разрешённого окна; при replay не менять.

```json
{
  "version": 1,
  "projectId": "prj_FSsQxUktUBH9VNCGeadBoNnzlD1W",
  "tenantId": "2157bde1-1994-465b-9f80-e1b740ee3cb1",
  "manifestSha": "bef8eaf3e75db27fd166852951eb646d228b6b3f21e37f9e6052a5bfa20be821",
  "releaseSha": "4aef8c35faa9c0e6de77f268b6bce232ccd562a4",
  "codeSha": "871badb7944aa2cdce78ed0d1080d61370c976648b506790f5429f38dc413e18",
  "schemaSha": "0000000000000000000000000000000000000000000000000000000000000000",
  "applicationTimestamp": "2026-10-05T22:00:00.000Z",
  "database": { "host": "db.jawposhuxaexoqzopgoq.supabase.co", "port": 5432, "name": "postgres", "user": "postgres" },
  "authorization": null,
  "backup": null,
  "barrier": null
}
```

Реальное authorization: только ключи `scope`, `approvedBy`, `approvedAt`, `expiresAt`.
scope = `APPLY_FULL_MAIN_MANIFEST_AFTER_VERIFIED_BARRIER_AND_BACKUP`; recorded owner
approval должен охватывать именно этот scope, код, manifest и окно. Это локальная
операторская запись разрешения, не криптографическая подпись и не замена согласия владельца.

Реальный barrier: `path` (абсолютный путь к сохранённому отчёту покрытия URL/jobs/skew,
probe/log evidence), `sha256`, `verifiedAt`, `drainedAt`. Реальный backup: `path`
(абсолютный путь к свежему dump), `sha256`, `snapshotAt`, `restoreVerifiedAt`.
Все timestamps UTC ISO. Порядок: authorization ≤ barrier ≤ drain ≤ backup ≤ restore ≤ now.
Не подставлять вымышленные timestamps или synthetic evidence: runner проверяет hash/
порядок/свежесть, но не может сам доказать внешний WAF, restore или owner approval.

## Последующее разрешённое окно — порядок, не выполненные действия

1. Отдельно утвердить конкретный barrier config и scope остановки jobs; применить
   только разрешённые изменения, доказать coverage/drain, получить свежий backup и
   его restore evidence. Здесь нет команды WAF: подходящее проверенное правило ещё
   не установлено, придумывать его как готовое нельзя.
2. Применить только ранее проверенный additive SQL шести колонок и целевой marker
   `20261005100000_execution_operation_policy` отдельной утверждённой процедурой.
   Runner не исполняет DDL/Prisma history и не включает `migrate deploy`.
   Stage8B и старые checksums не исправлять. Это остаётся отдельным live gate.
3. Установить `MARIPOSA_IMPORT_DATABASE_URL` только в защищённом окружении исполнения
   существующим согласованным способом, не через аргумент CLI/чат/request JSON.
   `.env`, `DATABASE_URL` и fallback credentials runner не использует; credentials не логирует.
   Других возможностей автоматического подключения нет.
4. После целевой schema read-only `--inspect` возвращает digest структуры (включая
   triggers, constraints, RLS/ACL/policies), без business rows. Сверить структуру с
   утверждённой схемой; не принимать hash произвольной схемы лишь потому, что команда
   его вывела. Внести проверенный schemaSha в request. `--preflight` использует
   REPEATABLE READ READ ONLY, без row/advisory locks и без записей:

```powershell
node scripts/catalog-main-import.cjs --inspect --manifest $manifestPath --request $requestPath
node scripts/catalog-main-import.cjs --preflight --manifest $manifestPath --request $requestPath
```

5. Под закрытым ingress подготовить/проверить утверждённый Production-compatible
   release и точные aliases. Только когда все STOP gates закрыты, выполнить один apply:

```powershell
node scripts/catalog-main-import.cjs --apply --manifest $manifestPath --request $requestPath --confirm APPLY_FULL_MAIN_MANIFEST_AFTER_VERIFIED_BARRIER_AND_BACKUP
```

Apply повторяет preflight под существующими advisory/row locks, сверяет schema и
сохранность всех public tables до COMMIT. Для target product/variant/stock rows
из сравнения исключены только разрешённые изменяемые поля; остальные tenants,
фото, документы, финансовая история и прежние append-only rows сохраняются.
Marker, цены, corrections и изменения каталога входят в одну транзакцию.
Replay проверяет after-state/history/preservation и возвращает writes=0.

6. Выполнить прежний read-only `--preflight`: требуется replayed=true/writes=0 и
   ожидаемые totals. Нельзя объявить успешным новый применённый импорт по одному
   совпадению сумм без per-ID/hash сверок runner. Только после сверки и разрешённой
   проверки приложения открыть новые aliases; старые writers остаются закрытыми.
   При проблеме после COMMIT — закрытый ingress и policy-compatible rollforward/
   rollback по согласованному плану; старый 9f1 не открывать как обычный rollback.

Полная security E2E, live роль/RLS, фактический WAF/drain, физический iPhone/печать,
новый backup и реальный schema/import/promotion этим результатом не подтверждены.

## 2026-10-06 session connection boundary

Only five new offline connection-guard tests were run: exact endpoint/CA, foreign endpoint and URL overrides, missing or invalid CA material, retained direct profile, and unchanged tenant/manifest/release/code/apply gates. PASS 5/5; zero database connections in the tests. Existing transaction/regression suites were not repeated.

The existing configured DATABASE_URL is consumed only in memory by an authorized one-shot launcher; do not copy it into a new file or command line. Supply the original session URL explicitly to the runner environment and the public certificate path separately. The runner itself still never loads .env. For native backup tooling use the same exact session profile with PGSSLMODE=verify-full and PGSSLROOTCERT pointing to the public CA, with credentials only in the child process environment. PostgreSQL 17 native libpq connectivity was also verified read-only with verify-full and this CA: expected Main identity passed through the exact runner connectionConfig. No dump was executed. Fresh backup and isolated restore verification remain maintenance gates; the earlier backup script with weaker SSL settings is not the approved launch path.

No WAF publication, drain, fresh backup/restore, schema migration, import or promotion is implied by connection readiness. Require the existing maintenance gates and a new request binding this runner code digest. Application runtime remains pinned to 4aef8c35faa9c0e6de77f268b6bce232ccd562a4.
