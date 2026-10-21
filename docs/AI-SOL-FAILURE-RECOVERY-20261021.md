# Sol live failure: evidence and prospective recovery

Base deployed: c005aeb0e27b0e449c180b64ca0f3969f5a7ba15 / dpl_F1gmtawqKKzy66HkNvJK8CsCZBVE. This recovery is LOCAL, not deployed or live-accepted.

## Verified live replies (verbatim)

1. User: «У вас есть жёлтое платье на завтра?»
   Sol: «Пока не могу подтвердить наличие жёлтого платья на завтра. Какой размер вам нужен?»
2. User: «140»
   Sol: «На сколько дней вам нужно жёлтое платье размера 140 с завтрашнего дня?»
3. User: «На один день»
   Sol: «На один день, с завтрашнего дня, жёлтое платье размера 140. Сейчас не удалось проверить наличие на этот срок — пока не могу подтвердить, есть ли подходящий вариант.»

Fourth user message asked for the nearest Saturday, for one day. The visible reply was an application fallback, not a verified model answer: «Проверка ответа помощника сейчас недоступна. Сохранённые пожелания не потеряны; непроверенные рекомендации не показываю.»

## Confirmed facts versus unknown causes

13 attempts, 12 verified gpt-6.1-sol receipts. Confirmed token-derived cost USD 0.123587, reservation USD 3.514808. This is not a billing invoice. The final reviewer a7d2c6a5-affb-4ec2-a66f-4a765837db99 remains reserved: created 2026-10-21T19:07:58.148Z, reserve USD 0.047300, actual cost and response ID NULL, lease until 2026-10-25T19:00Z. Fresh read-only database inspection during this recovery confirmed these values. No attempts were repeated, released, edited or deleted.

The reviewer reservation began approximately 25 seconds after UI submission. The route has a 25-second abort deadline. Deadline pressure is plausible, but the database cannot establish whether the request reached OpenAI, completed, or failed while persisting. Narrow deployment/time-range runtime log reads returned no records. Do not call this a proven timeout or zero cost.

The availability failure also has no preserved raw tool arguments/result. Existing code collapsed calendar evidence failures, missing search inputs, and data-read failures into one generic tool error. Therefore we cannot establish which occurred in turn three, or infer absence of stock. The first three utterances were model-generated; the fourth was application-generated. Offline scripted results do not establish live language quality.

## Local changes

- Save a completed, validated provider receipt before rejecting late UI output. Previously the abort/window check could discard receipt evidence after the SDK returned. This is a confirmed code path defect; it is not proof that the historical unknown followed that path.
- Refuse a new provider reservation when less than 6 seconds (planning) or 10 seconds (review) remains. This is conservative admission, not a completion guarantee or a timeout increase; some slow turns will stop earlier without another paid request.
- Distinguish enumerated calendar evidence/schema, missing information, read timeout/unavailable, and receipt persistence failures. Diagnostics contain no message text, arguments, raw exceptions, IDs, headers or credentials.
- On a duration-only message, give the model a typed calendar correction: preserve the known pickup with start:null, use evidence from the current message, never re-quote a historical date. Grounded validation remains active; failed identical calls cannot be retried.
- Count actual reservations and settled receipts separately from logical model invocations. A call stopped before reservation is not reported as unknown paid usage.

## Offline evidence

scripts/assistant-provider-deadline.cjs: deadline rejection before reservation; completed late receipt persisted but answer withheld; transport/invalid usage/persistence failures remain unsettled; no retry; observer errors cannot change accounting.

scripts/assistant-manager-dialogues.cjs: 14 scripted turns, 11 calendar checks, 45 scripted calls, zero live calls or database writes. Added historical-date misquote -> typed rejection -> duration-only correction with preserved pickup and size.

scripts/assistant-owner-day-targeted.cjs: all 11 groups PASS, including owner/tenant isolation, date window, daily accounting, mixed-model receipts, unknown lease blocking and idempotency.

## Remaining blocker

Unknown reviewer still blocks subsequent calls despite USD 10 daily ceiling and monetary headroom. No new schema is required for these prospective fixes. The existing schema cannot settle a historical unknown without a verified receipt. Provider-authoritative receipt/usage evidence is needed; absent that, a separately reviewed reconciliation design would be required. Do not fabricate usage, assume zero, clear the lease, reset the day, or replay the request. Complete live selection is NOT accepted.
