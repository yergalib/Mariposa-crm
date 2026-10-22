# Direct Preview-host candidate — PAUSED LOCAL ONLY

Host-bound routing was prepared before owner asked about Production. Not published, alias not assigned, no exception/secret/SQL/webhook changes. Candidate host mariposa-telegram-owner-test-mariposa-crm.vercel.app: team alias lookup returned 404, not a global reservation guarantee.

Guards: URL authority and Host must exactly agree; Forwarded/X-Forwarded-Host never grant access. Only POST /api/telegram/webhook with no query and valid config/verifier; all other paths including Next static/image/data, login, CRM and enrollment denied before existing allowlists. Matcher covers every path; previous static behavior retained on other hosts. Handler repeats gate. Mode/config/token/verifier absent fails closed.

Offline tests: 196 negative path/method combinations, 116 main-host baseline comparisons, direct-handler denial before DB. Typecheck, affected lint, isolated build PASS. Telegram chain/enrollment/catalog/adapter/delivery and owner-day regressions PASS. No live acceptance; platform routing/normalization must be checked while protected before any hostname exception.

Production read-only findings 2026-10-22:
- mariposa-crm.vercel.app resolves READY dpl_2Q8tkResqny1N4Bv6WZKWEAwXkmr, target production, SHA 58ad59e92ff937c4201b4eac5ef68fb4d9b635cc, ref review/crm-website-integrated-20261010.
- GET /login returns200 with CRM markers, no Vercel SSO barrier. GET /api/telegram/webhook returns307 /login from app. Direct Production callback is feasible without new hostname; not implemented or approved.
- Production code has no Telegram routes, owner-day guard, recorded-turn/reviewer checkpoint/settlement changes. Telegram candidate depends on Preview-only ownerDayConfig, so cannot simply be enabled on Production. Need separate exact Production owner authorization/budget configuration, without broadening existing Preview gates or public customers.
- Prisma code delta includes eight nullable ledger fields. Service SQL checkpoint/ledger extensions are outside original Production migration history. This code comparison does not prove current live DB schema; do fresh schema-only compatibility verification before a selected Production release, not blanket migrations or overwriting business data.
- Metadata-only env readback: Bot Secret exists only in approved Preview branch, no Production Telegram entry. No values read or copied.

Minimal direction: if owner chooses main CRM, prepare a narrowly scoped Production Telegram release, authenticated POST webhook exception in app proxy only, existing CRM auth unchanged, service schema compatibility/three Telegram tables, scoped token/verifier and owner enrollment. No separate relay/Trusted Sources/Preview hostname required based on current observed Production reachability. Production approval still pending.
New bot would avoid changing old bot/Render webhook; it does not itself fix endpoint reachability or shared CRM implementation. Old Render ownership/code/config are unverified, so no claim it is easier. No bot/Render operations performed.
