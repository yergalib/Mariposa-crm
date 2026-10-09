# Local conversational consultant candidate — 2026-10-09

## What changed

The authenticated showroom API now dispatches free text, search suggestions and comparison discussion to runAssistantConversation. The primary text path is a real bounded Responses API orchestration loop on the existing provider, not the legacy regular-expression intent router or a scripted answer generator. The model receives both user and assistant history, current draft criteria, branch/timezone, public category metadata, selected variant IDs, compared product/execution references, ordered recent-card IDs and chronological verbatim preference notes.

The model can ask its own questions, acknowledge discomfort/uncertainty, handle corrections and multiple requests, read tools and write a natural final answer. No automatic fallback silently turns a model failure into a catalogue search. Errors remain visible and unsent state stays unsent.

Existing explicit buttons (select/remove/period/restore/more/finish) still run the deterministic validated action handler. Free text such as "cancel my inquiry" never triggers its legacy finish/create-draft regex. The old extraction engine remains only in that legacy structured-action path; it is not the main consultant. assistant-ui remains the rendering layer.

## Data and tools

- Existing public CRM runner and tenant/branch/publication checks are reused. No schema, dependency, backend or provider/key setup was added.
- get_product, get_rental_rules and list_branches reuse their existing definitions. Bounded find_dresses/read_variant/find_cheaper adapters call the same existing server-side methods. A shared pure comparator is reused by legacy and conversational price comparison.
- remember_preferences updates only the local unsent draft, not CRM. Every patch requires an exact quote from the latest user message. Height cannot become a size; ambiguous/relative dates require clarification. Negative colour clears the old positive colour rather than broadening search. Unrelated preferences and dates are retained. Notes are chronological wishes, not asserted product facts.
- Recent cards persist only product/execution/variant IDs and slot/order, not prices or availability. "The first one" can be resolved and reread. Each returned card carries its own server-assigned slot, so a mixed dress/shoes answer selects the correct category.
- Final cards and comparisons must match successful reads in this turn. Price and availability placeholders are filled on the server from CRM DTOs. Literal numeric currency assertions, common false action/human claims, unknown card IDs and unresolved placeholders are rejected. These syntactic guards plus instructions do not prove every possible natural-language assertion is truthful; live model evaluations are still needed.
- Product names, history and tool data are explicitly untrusted, not instructions. Unknown tool names cannot execute. There is no write, cancel, reserve, payment, external-message or human-handoff tool.
- Care, damage and cancellation policies are explicitly unknown in the tool response because only approved rental steps exist. The model must clarify or offer staff contact instead of inventing a policy.
- Existing UI comparison refs are sent with free-text requests too. Quoted wishes survive tab-state restoration and can appear in the clearly unsent handoff draft. No durable Conversation/Message schema was added.

## Limits and preserved gates

After independent review, each turn permits at most three model calls, two model-requested function calls (one per response, matching parallel_tool_calls: false) and eight runner read operations (including selected-item revalidation). A read_batch call holds at most four sequential read-only operations; correction plus search/rules and comparison of four products therefore fit the two tool rounds. See ASSISTANT_CONSULTATION_REVIEW_FIXES_20261009.md. Max output is 1,400 tokens per model call; request JSON <=48,000 bytes, individual tool output <=12,000 bytes. These byte limits are payload guards, not token counts or a monetary cap. Tool failures are sanitised and the same failed call is not retried in the turn. Existing zero SDK retries, 25-second route deadline and process request limits remain. The rate limiter counts each model call; a three-step turn uses three model allowances.

access.ts is unchanged, including the old review/pilot-preview-rollout equality check. No branch move or bypass was made. The main working branch stays review/website-current-20261009. No enabled flag, auth/permission gate, environment, secret, database schema, Production state, photo or audit code was changed.

The existing one-shot smoke limiter from 324c909 is unchanged. Its text-only/600-output shape intentionally does NOT admit this tool-using 1,400-output conversation. This candidate therefore does not inherit a claim that a live consultant session fits that runner. Before a paid scenario test, the safe executor/key-to-project link and a reviewed tool-loop budget/adapter need separate confirmation. Future correction of the obsolete access-gate branch must be explicitly scoped and authorized; it is not silently bundled here.

## Verification and limits of evidence

Scripted model + synthetic CRM scenarios cover discomfort with a voluminous dress, shyness, exclusion of pink, switching to white without losing dates/height, first-card reference, cheaper alternative plus unknown care rules in one turn, cancellation without creation, unknown refund rules, failed CRM read with no retry, injected instructions in product data, disallowed tools, foreign/unpublished IDs, fabricated price/card/action claims, maximum model/tool/output budgets, restored draft/handoff and mixed dress/shoes cards followed by explicit shoe selection.

These tests verify actual orchestration, data provenance boundaries and state transitions with scripted provider outputs. They do NOT prove that the real LLM correctly understands every paraphrase, sounds natural, resists every injection or never hallucinates. Real provider calls: zero. No real inquiry was created.

Related targeted suites (read tools, outfit actions, tab state, draft summary and price comparison), typecheck and scoped lint passed. Initial evidence: C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-consultation-checkpoint-fgL92L. A final mixed-slot correction was then tested; definitive final-source hashes, updated scenario result, scoped lint and isolated build evidence are in C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-consultation-final-YKaaxC. Build uses the established allowlisted child environment with synthetic postgresql://synthetic:synthetic@127.0.0.1:1/synthetic, without .env changes or a live database. It is a compilation check, not production E2E.

Official implementation references, fetched 2026-10-09:
- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/structured-outputs

Next live evaluation, only after separate safe-environment/budget confirmation: assess unprepared paraphrases and interruptions, preference changes across longer sessions, ambiguous references, unavailable business facts and adversarial product/user text. Evaluate whether clarification is useful, whether replies are natural and whether every business claim is supported. Do not score the scripted fixtures as evidence of real model language quality.
