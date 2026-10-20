# Confirmed execution colours with materials

The catalogue now resolves a single known colour followed by `+ шелк` / `+ шёлк` or `+ велюр`, including owner-confirmed 2366 names `белый + шелк`, `белый + велюр`, and `чёрный + велюр`. Case, whitespace and ё/е are normalized for matching only. Original execution names and material information remain unchanged in DTOs and card labels. The existing `шампань + рукав` exception remains supported.

The shared catalogue resolver and AI confirmed-colour matcher use the same descriptor normalization. No API, database or public DTO shape changes. Exact user colour requests remain strict. Unknown suffixes and negations remain unconfirmed and cannot inherit a model colour. Genuine multi-colour executions retain existing AI component matching, while single-colour UI groups do not claim a dominant colour.

Validation:
- PASS `champagne-color-targeted.cjs`: white/black/champagne with materials, original labels, request strictness, unknown/negated/multiple-colour guards and execution precedence.
- PASS `showroom-color-groups-smoke.cjs`: real publicBrowse/publicCatalog services over synthetic Prisma-shaped fixtures; material labels, exact colour filtering, pagination and existing tenant/publication/availability guards.
- PASS `showroom-color-smoke.cjs`, `showroom-color-representatives-smoke.cjs`, `assistant-color-cheaper-regression.cjs` (scripted, zero live model calls).
- PASS `material-color-browser.cjs`: actual React catalogue components/CSS and shared resolver, synthetic DTOs, 390/430 CSS px, zero POST requests. Screenshots in `evidence/material-color-20261018`; visually inspected 390 px cards show all three confirmed labels and the unknown-token warning without clipping. This isolated harness does not test live Pilot data or Next routing.
- TypeScript and scoped ESLint for the changed production module completed without diagnostics. Next webpack build log saved alongside screenshots. The initial sandbox build failed creating `.next/static/chunks/app/sales/new` with EPERM; rerun with local filesystem access.

No data reads/writes, migrations, environment changes, paid AI calls, push or deployment in this follow-up. Photo and price placeholders in synthetic screenshots say nothing about Pilot completeness. Previous main-tenant variant counts are not evidence about Pilot. Remaining step: separately authorize publication of this local commit, then inspect the approved Pilot executions in the published UI.

Final Next webpack build: PASS, exit 0 (local isolated environment, synthetic loopback DB URL).
