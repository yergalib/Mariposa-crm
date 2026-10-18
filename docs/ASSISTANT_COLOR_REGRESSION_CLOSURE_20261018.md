# Colour/cheaper regression contract correction

Follow-up: the additional legacy fixture incompatibility below is now closed; the complete original consultation smoke passes after its fixture update. See ASSISTANT_CONSULTATION_SMOKE_CLOSURE_20261018.md. Historical diagnostic text is retained below.

The failure at the former assistant-color-cheaper-regression.cjs:42 was a stale test expectation, not loss of user colour. Commit e7bb410 introduced the narrow explicitColorCorrection grammar and snapshots originalContext **after** saving a directly evidenced user colour. The exact prompt “Лучше синее, остальные пожелания и даты те же. Есть вариант дешевле первого?” matches that grammar. A valid negative reviewer verdict rejects model-authored edits/prose/cards, but cannot undo that deterministic user command. Rolling back to White would contradict the saved user instruction and the existing assistant-evaluation-regression contract.

Only the regression test and documentation changed; production behaviour is unchanged.

The test now distinguishes:

- Explicit blue survives rejected model `color:null` + note, while model notes, prose and all business panels remain rejected. Dates, height, size, other slot criteria, original notes, selected items and caller-owned context are preserved.
- A search with an omitted model patch already uses blue. The old scripted White card ID is correctly rejected as unverified; a verified Blue card is still hidden on reviewer clarification. This preserves the provenance assertion rather than deleting it.
- An ambiguous blue question or negated blue statement cannot replace saved White when the reviewer rejects the model patch.
- “Не розовое” preserves saved White, but clears saved Pink without inventing an alternative; period, height and size persist.
- Unknown comparison reference remains an error and yields no cards when there is no explicit first-card request. With the exact “cheaper than the first” request, f271023's bounded server completion uses the saved first card and returns the genuinely cheaper synthetic Blue card. Both cases are now separately asserted instead of treating valid completion as a failure.

Verification: assistant-color-cheaper-regression PASS; assistant-evaluation-regression PASS (10 checks); assistant-independent-boundaries PASS (14 negative/ambiguous colours, 3 positive controls, 8 ID/tenant cases). All use scripted providers and synthetic services, zero network/DB/paid calls. No production source changed, so the ae7f1e8 typecheck/lint/build remains applicable; no unnecessary rebuild.

Additional legacy test diagnostic: assistant-consultation-smoke fails at its first final response because its `final()` fixture omits the now-required `preferenceChanges`; its reviewer also emits obsolete `{decision}` instead of `safeSentenceIds/preferenceDecision/reason`. This suite was not counted as passing or repaired wholesale in this narrow task. Its colour exclusion/preservation scenarios were explicitly covered by the current regression above. This is a known fixture-contract incompatibility, not an unexplained production failure; no claim that every historical script is green.

Supersedes the unresolved colour-cheaper discrepancy recorded in CHAMPAGNE_COLOR_20261018.md and its historical targeted.json. No publication, data change or live model verification.
