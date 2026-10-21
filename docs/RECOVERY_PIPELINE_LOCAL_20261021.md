# Local recovery pipeline checkpoint

Base eef4cdd, unpublished local changes only. No live AI, network, database write, deployment or alias operations.

The response now carries a bounded recoveryReason enum (no raw provider/tool errors or user text): missing_information, invalid_model_response, preference_not_confirmed, review_unavailable, prose_not_confirmed, tool_timeout, tool_unavailable. Missing branch/dates/hours/size/colour produces a specific question when a search actually fails for that missing input. Read failures never become no-results or unavailable-stock claims. A timed-out tool ends the turn without a second model call/retry. Unsupported IDs still fail grounded validation.

Rejected model patches are NOT accepted field by field. A separate conservative literal extractor can retain explicit size/height labels independently; only whole messages composed of simple labelled fields qualify. Negation, ambiguity, conflicting numbers, wrong-slot references and free-form qualifying clauses disable salvage. Existing confirmed civil-date handling remains available. Height never sets size. Cards/availability are not carried over under changed preferences. Normal model-generated changes still require the existing evidence and semantic review.

13 new offline scenarios (assistant-recovery-targeted.cjs):
1. size100 + invalid colour evidence: size retained, previous colour retained, no cards.
2. height100 + invalid colour: height retained, size90 unchanged.
3. negated size100: not retained.
4. conflicting size100/110: not retained.
5. uncertain size100: not retained.
6. size + shoe request: no cross-slot salvage.
7. size100 + 'this is old size': no quote cherry-picking.
8. malformed planner JSON: invalid_model_response, independent size retained.
9. malformed semantic reviewer: review_unavailable, no rejected prose.
10. catalogue request with civil dates but no clocks: missing_information, asks hours, not dates again.
11. tool throws typed504: tool_timeout, no second planner request, no cards, dates retained.
12. ordinary tool read failure: tool_unavailable, not empty catalogue.
13. valid preferences but no approved prose: prose_not_confirmed, no invented recommendations.

Previous31 dialogue variations retained, including exact screenshot '22.10.-23.10' and 'на завтра, на сутки'. Existing full-run, relative-period and owner-day guards pass. Full-run assertions updated only where the intentional generic-text replacement now exposes a reason; card/context/retry assertions remain.

Model vs deterministic boundary: model still interprets free-form conversation, proposes quoted changes, selects read-only tools and drafts prose; separate reviewer approves semantics. Deterministic code parses only bounded explicit forms, checks schema/evidence/tenant/time, classifies failed operations and asks for known missing fields. Scripted fixtures do not prove real model quality. No training, model replacement, design change or grounding removal.

Remaining: publication access is still blocked by Vercel403. Neither7047cbe nor later fixes have a confirmed READY deployment/alias in this task. Stable showroom last showed old compound-colour labels. Live multi-turn quality must be checked separately after the intended version is verifiably served; this checkpoint makes no live-quality claim.
