# Webhook destination inspection candidate

LOCAL ONLY. Stable Preview remains cleanup 4e332cb; no push/deployment or external call in this task.
Prior result retained only configured=true, pendingUpdates=0. Repository and saved report do not identify destination. Historical note that handler was not launched is contradicted by current webhook presence and is not a reliable destination inference.

Candidate restores temporary OWNER-only POST diagnostic with exact origin / same-origin CSRF, no-store, fixed Telegram API methods, redirect:error, timeout, static redacted failures. Adds only hostname parsed server-side from getWebhookInfo URL and conservative infrastructure classification. Full URL, credentials, path/query are not returned, logged or visited. Unknown hostname returns service=unknown; hosting provider does not identify application ownership.

Execution requires diagnostic-only Preview deployment and ordinary MAIN OWNER session. Last confirmed desktop Chrome session required login; phone session is not available to executor. Without an existing authenticated owner session, the owner must open /telegram-inspect and press the read-only button once. No safe existing stored data answers this question without a fresh server read. After result, remove diagnostics and publish cleanup again. Never change webhook/queue or activate runtime. No schema/env/access changes.

Offline auth/CSRF/redaction/hostname boundary tests and typecheck pass. This is not a live destination result.
