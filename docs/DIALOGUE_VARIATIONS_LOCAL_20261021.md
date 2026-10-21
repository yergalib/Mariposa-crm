# Local dialogue variation regression, 2026-10-21

Base97ac4a1. Local-only patch: no push/deploy, API calls, live DB, model calls or panel redesign.

Confirmed defects fixed:
1. Pending dateDraft previously intercepted unrelated utterances, so budget/exclusion/alternative requests never reached the conversational pipeline. Now only narrow date/hour/simple-preference follow-ups are consumed; others keep their context and reach normal evidence + semantic review.
2. Seeing an explicit date deleted dateDraft before validating the proposed replacement. Now rejected replacements preserve the draft; accepted explicit timestamp patches clear it transactionally on the cloned context.
3. Excluding the current positive colour cleared that colour but lost the exclusion note. The same-colour exclusion regression failed before the fix; the quote is now preserved (without converting negative colour to a positive filter).
4. Exact any-colour fast path bypassed saved budget/exclusion notes. The regression failed with zero planner calls instead of expected delegation. Recognized budget/negative constraints now reach the normal grounded pipeline; mixed date/hour/budget input retains its literal preferences before choosing the fast path. This routing guard is not a general natural-language classifier or a new budget filter.

Small deterministic period grammar supports affirmative tomorrow/day-after-tomorrow or a valid explicit civil date with stated1-31day duration, including 'на день', 'на сутки', digits. Missing hours remain missing and are specifically requested. Ambiguous 'или', invalid dates, uncertain/negative requests and out-of-range durations are delegated without overwriting the old draft. No dates/hours/size inferred from height.

New scripts/assistant-dialogue-variations-targeted.cjs:24 scenarios,23 scripted transport replies,0 real model calls, no network/DB. Covers height90 vs size90; tomorrow/day-after-tomorrow/concrete dates; duration; missing/separate hours; budget and colour exclusions while awaiting hours; size changes; mixed preferences; rejected timestamp replacement; ambiguity/invalid date; any colour; no-results; alternative request routing. Existing full-run suite covers grounded cheaper alternatives, comparisons, failed/empty reads, invalid review, unknown IDs, stale-card rejection. Existing relative-period + owner guards pass.

Meaning of PASS: actual state, evidence validators, tools and response-routing code accept/reject the scripted contracts correctly. Scripted planner/reviewer replies do NOT establish that the live model will choose those updates or produce good prose. Free-form paraphrases, real tool selection, budget/style relevance and conversation quality still need a separately authorized live check; none was performed here. The latest published site remains97ac4a1.
