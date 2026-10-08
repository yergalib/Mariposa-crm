# Text templates and customer drafts: local preparation

## Existing implementation reused

`/settings/documents`, `lib/document-settings.ts` and `DocumentSettingsForm` already provide persisted organization name and branch name/address/phone, optimistic revision checking, audit and a live preview using `RentalDocumentV2`. New rental snapshots capture those fields; old immutable V1/V2 retain their captured data and renderer. This is finished metadata editing, not an arbitrary template constructor. The current change makes the form read-only with no save button unless the current member has `DOCUMENT_SETTINGS_MANAGE`; the existing service remains the write authorization authority.

There is no existing field for free document text. `OrganizationSettings` has operational settings only. Storing template bodies in branch address, Inquiry requestText/nextAction, or existing snapshot rows would corrupt business semantics and is not implemented.

`/whatsapp` already renders factual availability replies for manual copy via `CopyInquiryReply`; `/chats` is the existing Inquiry queue. Neither is an authenticated WA/TG delivery integration or a sent-message history. Those paths are preserved; no second Conversation/AI system is introduced.

## Implemented pure draft renderer

`lib/notifications/customer-drafts.ts` provides proposed RENTAL_PERIOD, PLANNED_RETURN and SALE_HANDOVER text. Every result explicitly has `status: DRAFT_REQUIRES_REVIEW` and `deliveryEnabled: false`. The renderer has no DB, contact, network, clipboard or provider access and performs no persistence/approval/send. It can be reused by existing CRM paths after the persistence/approval decision; no unsaved editor pretending to save is added now.

Allowed placeholders: `orderReference`, `branchName`, `rentalStart`, `plannedReturn`, `issuedQuantity`, `remainingQuantity`. Facts are strictly validated: bounded strings, no control/bidi/braces, actual ISO dates, supported timezone, nonnegative integer counts. Unknown fields (contacts, recipient, financial values), placeholders, property expressions, malformed braces and missing facts are rejected. Planned dates are described as planned, not proof of a movement; partial/zero issue retains the actual remaining quantity. Caller must derive facts from existing tenant/branch-scoped Core under ORDER_VIEW; template rendering grants no data access and proves no approval or consent. Custom proposed text still needs human factual review. Plain text must be displayed through text nodes/textarea, never HTML.

## Minimum schema proposal — not applied

Useful persisted free-text editing cannot be implemented truthfully on the current schema. Propose one `CrmTextTemplateVersion` model, not another document/conversation/ledger subsystem:

| Field | Proposed constraint |
| --- | --- |
| id, organizationId | UUID; organization FK, tenant required |
| branchId | nullable active branch FK in same tenant; null means organization default |
| purpose, templateKey | enumerated document text block or customer-draft kind; no arbitrary runtime purpose |
| version | positive integer; unique (tenant, scope, purpose, key, version), including NULL scope uniqueness |
| body | plain text, max 2,000 characters; no HTML, executable expressions or user-defined placeholders |
| allowedPlaceholders, contentHash | versioned allowlist and canonical SHA-256 body/schema hash |
| state | DRAFT / APPROVED / RETIRED; approval never inferred from rendering |
| createdAt, createdByUserId | immutable authorship |
| approvedAt, approvedByUserId | both required only for approval; explicit owner review, including owner-authored text, never automatic approval |
| supersedesId | nullable same-scope/version lineage FK |

Draft edits append versions; approved content/hash/author/approval fields are immutable. Approval selects a version for future outputs; retirement blocks future use without rewriting historical outputs. Use explicit optimistic revision/idempotency and existing audit events; audit contains version IDs/hash, not contacts or message bodies.

Document metadata uses current DOCUMENT_SETTINGS_VIEW/MANAGE. Any free document block must first be explicitly approved by the owner; legal clauses/signatures/fees are excluded. Future configured document text requires a new snapshot/template V3 capturing the chosen version ID, hash and rendered text. Existing V1/V2 remain readable byte-for-byte with their old renderers. This is a future model change, not a promise that current snapshots accept edited bodies.

For customer templates, propose explicit template VIEW/MANAGE/APPROVE permissions, separately from ORDER_VIEW required to derive order facts. These permission keys are design only, not added to the current registry. Approval requires an active OWNER membership in addition to the template permission; creation/editing by the owner still requires an explicit review step. Sellers may render/copy an approved version only within their current tenant/branch read scope. No permission to send follows from template editing or ORDER_VIEW. CONTACT/recipient access, channel consent and financial visibility must be separate if later needed.

Retention proposal: unused unapproved drafts expire after 90 days; approved/retired versions referenced by retained document snapshots remain for that document retention period and cannot be deleted while referenced. Preview/customer text is ephemeral until a separate retention decision; do not store it in Inquiry notes or fabricate a sent-message record. Actual channel delivery later needs approved provider/account, recipient/consent model, retention and idempotent delivery receipts; none is implemented or paid for here.

## Validation and release boundary

Targeted tests cover deterministic business timezone text, missing/invalid facts, placeholder and prototype-expression rejection, controls/unknown contact/financial fields, plain-text escaping and partial/zero handover. Metadata component tests cover view-only/fail-closed fields, absence of save button and existing manage/save path with shared preview. Existing stocktake, rental print, snapshots, sale Core and channels are not rewritten.

These local changes are successors of QA `337825f`, not part of UI publication SHA `8628df12` or sale implementation SHA `2f0c544`. No schema/Production/data/channel/send action is authorized by this preparation. Remaining decisions: approve the proposed template schema/permissions/retention and actual text before persistent custom templates; separately authorize a real channel integration. Disabled sending is not a completed integration.

Final local verification: customer-drafts-targeted PASS; document-preview-access-targeted PASS; targeted ESLint PASS; checkout typecheck PASS; isolated offline webpack build (including TypeScript/static generation) PASS. No live DB or channel access. Synthetic proposed text samples: workspace customer-draft-evidence/proposed-drafts.json. No new HTTP/browser or physical-device claim for this metadata change.
