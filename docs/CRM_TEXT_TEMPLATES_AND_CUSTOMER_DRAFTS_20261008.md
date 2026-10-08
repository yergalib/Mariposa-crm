# Versioned plain-text templates: local candidate, 2026-10-08

## Implemented scope

Existing document metadata, Core order facts, permissions, audit and saved rental documents are reused. `/settings/document-templates` adds an editor, synthetic preview, immutable saved versions, explicit approval and archive. Plain text is limited to 1,200 characters and purpose-specific placeholders. HTML remains literal; contacts, financial placeholders and executable expressions are rejected. Saving always creates an unapproved DRAFT. Approval requires a separate confirmed action on the exact version ID and hash.

The additive `CrmTextTemplateVersion` model stores tenant, nullable branch scope, kind, version, renderer version, body/hash, idempotency key, immutable author/time and approval/archive provenance. Kinds: RENTAL_NOTE, RENTAL_PERIOD, PLANNED_RETURN, SALE_HANDOVER. Database guards forbid replacing content, delete and truncate. Superseding approval archives the previously approved version. Historical rows remain; no purge or expiration timer exists.

The existing permission engine exposes DOCUMENT_TEMPLATE_VIEW, DOCUMENT_TEMPLATE_MANAGE and DOCUMENT_TEMPLATE_APPROVE checkboxes. No existing role bundle or member receives these rights. Approval has no extra OWNER-role gate; existing OWNER semantics remain unchanged. Organization-wide writing/approval additionally requires existing SETTINGS_GLOBAL_MANAGE. Current tenant, active membership, branch and permissions are checked in service transactions. Template permissions grant no order/customer data access.

Approved RENTAL_NOTE affects subsequent saved rental documents only. Branch approval takes precedence over the organization default. New V3 captures template ID/version/hash and rendered text in its immutable snapshot. Without approved text, saves remain V2. Old V1/V2 snapshots and renderer sources are unchanged. V3 reuses V2 and adds informational text, without legal terms, fees, signatures or a signed-document claim. Later editing/archive cannot change old saved documents.

The pure customer renderer still returns DRAFT_REQUIRES_REVIEW and deliveryEnabled=false. Three proposed messages exist only as unapproved drafts in the synthetic test database. They are not seeded into real tenants. No WA/TG transport, contact lookup, sending, consent inference or sent-message record is implemented.

## Validation

Migration rehearsal used a fresh local clone of our own synthetic sale-test database. `scripts/text-templates-local-integration.ts` covers concurrent idempotency, stale revisions, placeholder restrictions, current tenant/branch/permissions, configured SELLER approval, database immutability/delete/truncate guards, retained archive, approved fallback, unchanged V1/V2 and fixed V3, unchanged existing permission bundles and unchanged order/ledger/stock data. `scripts/text-template-render-targeted.tsx` verifies old renderer source equality and escaped V3 output.

Workspace `template-local-evidence/manifest.json`, `result.json`, `renderer-result.json` and `browser-result.json` document actual checks and isolated scope. Browser testing uses fresh synthetic SELLER sessions, never an owner session. Physical printer and physical iPhone remain untested. Typecheck and offline webpack production compilation passed; these do not prove live migration readiness.

## Release boundary

Migration: `prisma/migrations/20261008190000_crm_text_template_versions/migration.sql`. Additive SQL creates one table, indexes, guard function/triggers and table-specific grants. No existing business rows, role bundles or snapshots change. SQL SHA-256: `17ef5d5c9d115fc3f855992e3827c070fb87440f7d8575eaba1866419f15deec`. API-role grants are conditional; local rehearsal creates no cluster roles. RLS prevents direct browser API access; the existing trusted server connection handles permission-checked service access.

This candidate follows `e996775` and is separate from the published exact UI commit `8628df12a8b327ced9641b2887b31185ae33d77c`. Production UI publication is complete and unchanged by this work. Applying new live SQL, assigning real users template permissions, approving real text and publishing later code require separate concrete authorization. No migration or template data was applied to Production. Do not publish this candidate against an unmigrated live database and claim templates ready.
