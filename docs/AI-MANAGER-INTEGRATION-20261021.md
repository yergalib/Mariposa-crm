# AI manager / Sol integration checkpoint — 2026-10-21

Applied only the fe9d8f701458693c564323fcd10e260b3148135b patch onto photo-cleanup 3e8eb8581ffbf37858e495fa4e18fb434ae0eca0. Temporary photo repair routes remain removed. Existing photos, CRM data and access unchanged.

Offline verification: assistant-manager-dialogues (13 turns, 11 calendar checks, 41 scripted calls; zero real calls/writes); assistant-owner-day-targeted; assistant-sol-policy; assistant-sol-candidate; assistant-review-cap-regression PASS. Isolated Next build PASS with zero network attempts. These fixtures verify orchestration, not live model language quality.

Read-only ledger at 2026-10-21 22:44:15 Asia/Almaty: 21 attempts, including 5 reviewer attempts, zero active/unknown leases. Under the explicitly conservative current-policy reservation: 16 * 0.369512 + 5 * 0.047300 = USD 6.148692. This is reserved accounting, NOT an OpenAI invoice or verified historical token cost. Admission requires another USD 1.155836 for the complete worst-case turn and therefore blocks against USD 2/day. No paid requests or extra smoke were made. Ledger rows must not be reset, discounted or deleted to permit testing. Natural day boundary: 19:00 UTC, Asia/Almaty midnight; read ledger again before any later dialogue.

Approved model/pricing: gpt-6.1-sol, low, standard; USD/M tokens input 2, cached input 0.10, cache write 2.50, output 10. Account-specific availability remains unverified without a permitted provider call. Only branch-scoped plaintext MARIPOSA_ASSISTANT_PRICE_ACK may change; credentials and security unchanged.

Preview release is a separate verification step. Do not infer deployment or live quality from this file.

Final typecheck PASS; lint PASS (zero errors, seven existing warnings in unrelated files). Initial typecheck overlapped generated Next types and was rerun successfully after build completed.
