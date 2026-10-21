# Approved owner-test daily ceiling — 2026-10-21

Explicit owner approval raises only the closed MAIN test daily monetary ceiling from USD 2 to USD 10. Provider calls remain 100 per Asia/Almaty day, ending 2026-10-25T19:00:00Z exclusive. No model/rate/input/output/turn-reservation changes; no new smoke. Existing ledger rows, legacy uncertainty allowance, actual usage accounting, ownership/tenant/permission gates and keys are untouched.

Runtime diff: OWNER_DAY.budgetNano and SOL_CANDIDATE.dailyBudgetNano only. Updated regression expectations exercise the new ceiling, retained historic rows, full-turn admission and limits. Publication and live evaluation evidence are recorded separately; offline tests do not establish model availability or dialogue quality.

Validation: owner-day targeted (11 groups), Sol policy/candidate, typecheck and isolated build PASS. Lint 0 errors / 7 existing unrelated warnings. No live calls during local verification.
