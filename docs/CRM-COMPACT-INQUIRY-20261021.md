# Compact inquiry follow-up to cc5ca7b

Actual route JSX changed, not just hidden CSS: compact status/arrival summary; primary action immediately below; one empty-work sentence instead of three empty fields; real assignee, next action and deadline remain visible. Overdue dates have text + color, and inactive assignees retain their warning. Client/contact, selected item/size and period precede secondary actions. Full subject/SKUs are in details. The short “Заявка, ещё не бронь” warning becomes an order-created notice after conversion. Existing-order link uses the same conversion permissions. Disabled assignment is explicit with a reason. Existing forms, server actions, version and scope guards are retained.

## Verified on synthetic data

- Five actual detail-route fixtures: NEW/unassigned; IN_PROGRESS/assigned; overdue; ORDER/converted; assignment unavailable due to missing edit/assign permission.
- Ten Chrome renders: desktop1440 and mobile390×844. On mobile primary button y320–364; client/item/period end at y676 (NEW), y703 (assigned), y713 (overdue), y651 (converted), y730 (disabled). All in the first viewport. Main action widths336px; height44px or more; no horizontal overflow. Real hydrated reveal-link interaction, keyboard focus and primary contrast checked.
- Actual save action/service fixture regression:16/16, including preserved contact, stale-version rejection, revoked assignment permission. No real mutations executed.
- New-inquiry tenant/branch/permission notification regression PASS. TypeScript, full ESLint and offline production build PASS.
- Evidence: `crm-mobile-evidence/render.json`, `fixtures.json`, `build.json`, `notification-regression/targeted.json`, ten screenshots. Official Library uploads and IDs: `crm-mobile-evidence/library.json`.

No site/AI, backend, schema, real records, settings or money changes. No push/deploy. Prior 75-route shared UI changes remain in cc5ca7b; this follow-up changes only the inquiry presentation and its fixture tooling.

## Eight routes excluded from the broad UI pass

1. `/invite/[token]` — invitation/auth.
2. `/login` — authentication.
3. `/orders/[id]/documents/[documentId]` — saved document rendering.
4. `/orders/[id]/print` — rental print form.
5. `/orders/[id]/sale-print` — sale print form.
6. `/payroll` — payroll.
7. `/products/[id]/labels` — printed labels.
8. `/showroom` — site and AI, owned by the parallel task.

## Still unverified

Published version and real authenticated browser→server→DB mutation journeys (claim, conversion, fitting creation); all populated/error/permission states of the remaining routes; physical iPhone and scanning; physical printing. They were not exercised against live data. Representative JSX visual checks and synthetic service tests do not substitute for those scenarios. No owner logic testing requested. Vercel publication remains blocked externally.
