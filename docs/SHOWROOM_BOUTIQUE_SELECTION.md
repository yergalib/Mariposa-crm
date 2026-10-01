# Boutique selection entry — 2026-10-01

Approved visual direction: unchanged logo, milk background, dark readable text,
a restrained rose accent, a separate butterfly button above the normal catalogue.
The wing motion runs once for 4.8 seconds; reduced-motion disables it. Native modal
provides Escape/focus containment and an explicit close button. The form remains
mounted on close; in-memory input/results/inquiry retry state survive reopening.
Reload/navigation clears that local state; no browser storage or external provider.

The form is explicitly NOT an AI chat. Exact size, branch and explicit local dates
use the existing public catalogue adapter. Age never becomes an inferred size.
Up to five real model/execution options from the first result page are shown in
catalogue order, with their actual availability and current price (or unknown).
No personal ranking or matching by unsupported attributes is claimed. Name can
narrow a broad selection. Colour, occasion, budget and free wishes remain labelled
preferences; they do not filter or promise a suitable/affordable result.

Selecting a variant opens the existing inquiry form. It displays the wishes before
submission. Optional bounded requestText is stored in the existing Inquiry field
only when the visitor explicitly submits; it participates in the original payload
hash/idempotency logic. Contact/wishes are not sent to the read-only search or LLM.
No schema migration, DB publication, order/reservation/payment, provider or credentials.

Read-only findings: current catalogue prices absent; existing price workbook is
pending. Product.color exists but is empty; execution labels contain usable colour
information. Sizes and main-catalogue accessories exist. PILOT currently publishes
four dresses only, no accessories; its products have no category links. Structured
occasion/style/compatibility links and a connected LLM are absent in inspected code.
Full conversation, compatible outfit selection and budget totals remain future work.
Do not duplicate the catalogue or ask the owner to re-enter existing size data.

Checks: typecheck/lint/build and targeted consultation, browse, selection,
grouping and tenant-isolation smoke tests. Tests use mocked DB/fetch only.
Browser visual/focus/touch verification remains blocked by the existing browser
restriction; no alternate session or restriction bypass was used.
