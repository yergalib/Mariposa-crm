# Telegram latency correction — 22 October 2026

## Observed before (read-only persisted evidence)
- Greeting 1: message 11:06:13Z; checkpoint 11:06:19.242Z; planner receipt 11:06:32.680Z; reviewer started 11:06:54.117Z and receipt 11:06:57.838Z. Provider intervals total 9.102s. Confirmed delivered; exact delivery timestamp not stored.
- Greeting 2: message 11:07:14Z; checkpoint 11:07:39.594Z; planner receipt 11:07:51.415Z; reviewer started 11:08:12.343Z, receipt 11:08:15.672Z. Provider intervals total 7.360s. Confirmed delivered.
- Third: message 11:08:00Z, checkpoint 11:08:58.220Z. Planner intervals 3.911s + 5.458s, reviewer 3.108s ending11:09:43.205Z. Verified output: «Помогу подобрать платье. Какой размер Вы носите?»; complete/sent with delivery receipt. Confirmed cost $0.028566.
- These intervals include provider wrapper/receipt work, not isolated model inference. No stored per-tool, stage or delivery timestamps: do not invent precise CRM/queue breakdown.
- Confirmed code: unconditional 503 after planning forces Telegram retry/backoff even for greetings; repeated sequential fresh authorization queries add DB roundtrips. max_connections=1 also serializes ingress, but individual queue time cannot be isolated from persisted records.

## Minimal changes
- Independent binding/member/branch authorization reads run concurrently. Same filters, same permissions, no cache.
- Checkpoint operations authorize after acquiring binding lock in the transaction; remove redundant preceding out-of-transaction authorization. Every operation still checks fresh membership/consent/window before reading/mutating the turn.
- When planning leaves at least16s of the existing24s processing budget, complete the SAME durable reviewer/CAS/history/delivery path immediately. Otherwise retain deferred retry; no new background service, no timeout increase, no reviewer bypass, no replay of unknown.
- Common model-first conversation unchanged. No scripted greeting; no skip of prices/availability validation.

## Expected vs proved
Offline tests prove preserved revocation/isolation/dedupe and inline path with exactly one review/send. Transaction scope reduces duplicate authorization from two sets to one, saving three reads per checkpoint operation; concurrency shortens independent non-transactional checks. Actual live latency reduction and frequency of fast-path eligibility remain unmeasured: no automatic paid test authorized.

## Child context and compound size reply
Confirmed live failure: the model extracted size110, yellow, autumn ball correctly, but explicitSizeEvidence required the entire reply to equal110. A leading numeric clause in response to a size-only question is now supported; height, budget and wrong-slot ambiguity still rejected. Planner and reviewer share child/caregiver context, no fixed response template. Exact three-turn regression preserves tomorrow,110,yellow,occasion and unknown duration.
Validation: telegram-child-context, telegram-chain, current assistant-manager-dialogues(15turns/17calendar checks), typecheck, affected lint and isolated build PASS. Old assistant-dialogue-variations-targeted and assistant-dialogue-boundary-targeted FAIL identically on baseline83c8ca2 and new code (older fixtures do not support current model-first/response contract). They were not edited to hide failures; no claim of complete legacy-suite PASS. No live paid replay performed.
