# Isolated small smoke, October 16

Approval: `Sentinel_c5b1ced99a648191a5c8f3dbe62bff83`, total USD 0.25.
Entrypoint: `scripts/assistant-small-smoke.ps1` (PowerShell 7, private local console).
This supersedes the blocked full-window calculation in `assistant-smoke-quarter-preflight.cjs`; that older diagnostic never launches paid work. Existing smoke scripts remain unchanged.

The reduced scenario uses three customer turns, synthetic public CRM fixtures, actual consultation/reviewer code, and at most twelve total provider requests. No DB or intake, stored API conversation, files/images, built-in paid tools, token-count endpoint, retries or deployment. The original key transport is reused; key enters masked SecureString, then stdin into a child with cleared environment, and is neither persisted nor printed. Source transcript fixtures are not sent.

Every complete immutable request (including instructions, schemas, tools, history and tool outputs) must fit 48,000 UTF-8 bytes. Oversized requests are rejected, never truncated. Allowed inputs have no remote expansion. Engineering input allowance: twice all serialized bytes plus 32,768 framing tokens = 128,768 tokens. This deliberately exceeds the byte-pair token bound for textual content and adds a large margin for model-specific framing. It is a conservative engineering assumption, not a provider-guaranteed tokenizer or account billing cap. No compatible local gpt-6 tokenizer was available.

Rates verified October 16: short-context gpt-6-luna input/cache-write USD 0.10/0.125 per million tokens, output USD 0.50/M. Default service, standard mode, output cap 1,400. Reserve uses the more expensive cache-write rate for every input token, plus 10% margin: `(128768 * 125 + 1400 * 500) * 11 / 10 = 18475600` nanodollars per request. Twelve requests reserve USD 0.2217072. No account configuration or top-up. Rates expire at 2026-10-17 00:00 UTC.

Reference: https://developers.openai.com/api/docs/models/gpt-6-luna
Byte-pair property: https://raw.githubusercontent.com/openai/tiktoken/main/README.md

One fixed local approval ledger is claimed with exclusive creation before key consumption/network. Each attempt is durably debited before transport; uncertain failures never refund, retry or reopen. Session expires after 15 minutes. Unexpected response usage/model/tier stops all further work. Missing cache-write counters are treated as unknown, not zero. The fixed ledger must not be deleted to repeat this approval.

Evidence goes to `../assistant-smoke-approval-20261016-144953`: attempt counts/byte sizes, validated usage, exact final post-review replies per turn, and final status. Raw HTTP errors, headers and credentials are excluded. A failed/incomplete run is not a successful quality evaluation. Assertions in the offline integration use scripted provider output and therefore do not establish live model accuracy or naturalness.

Offline validation: `node scripts/assistant-small-smoke-test.cjs` (17 checks); `node scripts/assistant-small-smoke-integration.cjs` (three actual pipeline turns, nine scripted calls, tool output and reviewer request guards); `assistant-small-smoke.ps1 -CheckOnly` (clean child readiness without key/network). Existing application typecheck/lint/build evidence for 663a31f remains applicable: this checkpoint only adds isolated scripts and documentation.
