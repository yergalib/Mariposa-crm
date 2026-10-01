# PILOT Preview rollout

This branch is for a protected Preview only; never merge/promote it to Production.
Base: 33acf98. Unfinished Telegram work is saved separately in the prior branch stash.

## Server boundary

The rollout branch pins MARIPOSA PILOT (de1e9e01-c7ad-45fc-899a-d2287f771355) in login membership selection, authenticated sessions, organization listing/switching, invitation lookup/acceptance, and tenant context construction. VERCEL_ENV=production is rejected. Public showroom requires STOREFRONT_ORGANIZATION_ID to equal this same tenant; missing or conflicting configuration is rejected. Set it only for this Preview branch. Public branch/product opt-in checks remain required; no publication flags are changed by code or migration.
This is application enforcement, not a separate database or dedicated database role. Existing shared user identities remain shared; no staff/account administration is part of the rollout acceptance.

## Database gate

Both organizations use one public schema. Current read-only checks: product_sheet_imports exists and its columns/defaults/constraints/indexes/RLS match the migration; its Prisma history entry is absent. New tables/column are absent. No SQL writes have been executed.
A recoverable backup and recovery procedure must be confirmed before writes. Through an authorized local process, the existing connection was tested by BEGIN READ ONLY and a count of the two expected tenant IDs; credentials were not printed or copied to another file.

Use the installed Prisma CLI and existing secret injection, never a manual history INSERT:
1. migrate status; verify only the expected pending migrations.
2. migrate resolve --applied 20260930130000_product_sheet_import.
3. migrate deploy from this clean branch containing only these three new migrations:
   - 20260930150000_rental_document_versions
   - 20260930160000_inquiry_queue
   - 20260930180000_public_showroom
4. Check history and schema, then PILOT-only smoke checks.
Do not use migrate dev, reset, seed, or include 20261001060000_telegram_inquiry_origin.
The SQL files currently have no explicit transaction wrapper. Review interruption/partial-apply recovery before applying. Prefer application rollback with additive schema retained; dropping new tables would lose captured versions/inquiries. Restoring the whole shared DB can also discard intervening MARIPOSA activity.

## Visibility and deployment gate

Push only review/pilot-preview-rollout after confirming Vercel Production branch and Git automation. Keep Preview protection enabled; never promote or change Production aliases. Reuse an existing Preview-scoped secret inside the authorized platform without reading/exporting its value. Confirm that it targets the inspected DB. The connected Vercel tool currently lists the team but zero projects; project/deployment lookups return 404, so automation/protection/env scope are not confirmed.
Publication flags for a specific PILOT branch/product list require their own confirmation. Until applied migrations and flags are verified, a deployment is not a working showroom.

## Verification

Completed locally: typecheck; build with unreachable dummy DB; lint with 0 errors and 7 existing warnings; mocked DB isolation smoke script. Real DB checks were read-only. No live functional/E2E tests, DDL, push, deployment, or publication flag updates have been performed at this checkpoint.
