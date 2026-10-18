# Owner-approved champagne matching

Local follow-up to catalogue integration 7d3a31f, preserving existing history.

- The shared confirmed-colour matcher includes champagne for a yellow request. A champagne request never matches plain yellow. Gold, beige, unknown and negated descriptors are not added.
- Existing catalogue colour groups gain Yellow. The same matcher filters it before pagination, including champagne. Existing champagne/beige links remain valid; no parallel database attributes or source-colour rewrites.
- The specifically confirmed execution descriptor `шампань + рукав` resolves to champagne for matching; original text remains the card label, including sleeve information. Unknown suffixes stay unconfirmed. Product execution still takes precedence over model colour.
- Exact request parsing remains strict; the approved execution descriptor does not loosen free-text request validation.

PASS: champagne-color-targeted; updated showroom-color-smoke; extended showroom-color-groups-smoke (actual publicBrowse/publicCatalog with in-memory Prisma-shaped data, pre-pagination yellow family, exact champagne, original descriptor, legacy URL group and tenant/publication guards); showroom-color-representatives-smoke. No real database or provider calls.

Final source: typecheck, scoped ESLint for all changed production TS/TSX files, Next webpack build PASS. Logs and exit statuses in `docs/evidence/catalog-color-20261018`. Build uses an allowlisted environment and non-listening synthetic loopback database URL; no environment files changed.

Additional check NOT green: `assistant-color-cheaper-regression.cjs:42` expects White after reviewer clarification but receives Blue. Reproduced exactly with all three changed production modules replaced in memory by their contents at 7d3a31f. This is an existing test/behaviour discrepancy, not introduced by the champagne patch; left unchanged rather than broadening this colour task. Do not describe the entire assistant regression suite as passing or this check as resolved.

No live data corrections (including the separate five-model plan), migrations, paid calls, gate changes, publication, push or deployment. Local patch is reviewable; publication remains separately authorized, and the pre-existing assistant test discrepancy should be considered in that decision.
