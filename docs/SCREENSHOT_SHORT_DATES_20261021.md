# Exact screenshot regression and architecture, 2026-10-21

Base: pushed 7047cbe, whose READY/alias is unknown after denied Vercel deployment list. Ordinary stable-site UI still shows unresolved compound color descriptors; do not claim this local patch is live.

Exact prompts tested after the quoted assistant turn with structured yellow/size90/occasion context:
- на завтра, на сутки: PASS before this patch; already supported by fce9245.
- 22.10.-23.10: failed before patch (unexpected model delegation). Now recognized as an affirmative bare civil range. Uses current branch year, displays full dates, asks pickup/return hours; does not invent hours or availability. No silent rollover to next year. Invalid dates, reversed/year-crossing ranges, >31 days and uncertain wording delegate without destroying saved draft.

31 offline cases, 33 scripted planner/reviewer responses, zero real model calls. Exact saved context is a test precondition, not evidence that the screenshot's client actually held those values. Existing relative-period and full-run suites pass. Color regression passes.

Architecture:
- ChatSelectionEntry keeps messages/context in useTabState. browser-tab-state uses sessionStorage with in-memory fallback; tab TTL30min. Sends last8 messages plus latest user and structured context. Successful returned context replaces saved context.
- With consent, history/service writes assistant_conversations snapshot plus messages, seven-day expiry. Restored context is continuity, never current availability proof. No provider-side durable memory: requests use store:false.
- runAssistantConversation first applies narrow deterministic handling. Otherwise model produces preferenceChanges with literal quotes, chooses read-only tools, and drafts prose. Server evidence validation checks changes. A separate model review chooses safe sentences and accepts/clarifies preference changes. Current-turn catalog DTOs supply business facts.
- verified-reply.ts contains the exact generic fallback. Unsupported preference evidence can return originalContext; review refusal, invalid/unavailable review, or no safe sentences can also surface the fallback. Thus several distinct failures look identical and a new preference may not be committed, even though the chat text remains visible.
- General language understanding is not provided by the regex paths. fce9245 fixed unrelated preferences swallowed while awaiting hours, prematurely deleted drafts, lost same-color exclusion, and any-color fast path skipping budget/exclusion notes. It did not train the model.

The screenshot alone cannot establish which validator/reviewer path failed, or which deployed SHA served it. No forbidden logs or live AI request used. To improve natural dialogue: preserve typed partial preferences independently of prose, evaluate real multi-turn utterances against the actual pipeline, distinguish internal rejection categories without PII, and keep grounding limited to factual claims rather than relying on generic failure prose. Training/model replacement is not established as the needed fix. Any broader architecture or model change remains outside this local targeted patch.
