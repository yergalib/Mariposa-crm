# Customer path local candidate — 2026-10-09

Base: ea07a21040ba89e6279c5ba19204cff0c09ec9e1, branch review/website-current-20261009. This candidate is local; it does not describe a new deployment. Existing published Preview remains the ea07a21 deployment.

## Scope and decisions

Owner direction: ordinary home → catalogue → product → guest favourites first; approved typography/hero, real CRM catalogue, no invented prices/availability/photos, no checkout or automatic reservation. Intake and LLM remain closed. No schema, data, secrets or platform settings changed.

Existing, retained: approved Cormorant/Onest pair; owner hero; carousel implementation with 3-second interval, pause/focus/hover/reduced-motion; colour navigation; branch-local explicit dates; CRM availability; real public-photo gallery with placeholders; public owner contacts; mobile navigation; guest favourites (12 items/30 days), comparison (4 items), assistant-ui shell. There is only one approved hero asset, so a second slide and visible rotation await an approved original. No replacement stock image was added.

Changes:
- Catalogue cards show current RENTAL prices for the selected public branch. The query scopes organization, effective date and branch/global fallback; the same resolver selects branch precedence in exact selection and browse. Without a branch no price is assumed. Ranges describe eligible catalogue sizes; partial prices are labelled incomplete, mixed currencies remain unknown. These are catalogue prices, not a calculated quote for a rental duration or a guarantee of stock.
- Added a short size-selection explanation without invented age/measurement conversions.
- Replaced unsubstantiated popularity wording with a catalogue heading.
- Other dresses preserve branch/dates/size/colour; accessories preserve branch/dates but clear dress size/colour/search. No similarity or matching claims.
- Failed favourite lookups offer an explicit refresh with pending state; deleted/unpublished items remain unavailable. Comparisons preserve the existing bounded public identifiers. With the assistant off, copy explicitly says nothing was sent.

## Verification

Targeted mock checks: showroom-browse-smoke (public DTO, branch/global priority, price range/missing/mixed currency/negative, SQL validity and tenant/branch filters, no undated availability call); showroom-favorites-ui-smoke (retry, unavailable items and four-item comparison); showroom-home-smoke (honest heading, native filters, accessory context).

Real React/Edge local harness: desktop 1440, mobile 390/tablet 768, home/catalogue/product/gallery/favourites/contacts; displayed synthetic price, exact size/dates, missing price, favourite failure→retry, selection cancellation and late response rejection, mobile navigation Escape/focus. Targeted 390px run: selection 503→retry, unsent fitting wishes, repeated review, return/reopen/browser Back. Both runs had zero POSTs and zero runtime exceptions. Navigation uses lightweight Next adapters and APIs/DTOs are synthetic; this is not deployed E2E or real CRM/Storage verification.

Final checks PASS: tsc --noEmit; ESLint app/showroom, lib/showroom and the browser fixture; Next 16.3.8 build (67 static pages, dynamic showroom); git diff --check. Build used a sanitized environment and a non-listening loopback dummy DATABASE_URL, with no application env file. No new DB test or live query in this block. Existing broader audit is not repeated or implied passed for this candidate. Live read checks remain unverified because the agent has no authorized Vercel browser session; no bypass credentials were created.

## Next AI step (proposal, not enabled)

Keep one assistant core with website/Telegram/WhatsApp adapters and the existing assistant-ui presentation. First extend the strict bounded request contract with selected product/execution identifiers and branch/size/explicit dates. Revalidate every identifier server-side with the same public tenant/publication rules and existing catalogue/availability tools; browser names, prices and stock labels are not authority. Currently comparison is local UI context; do not claim these IDs already form a structured model/tool request.

The assistant should ask for missing criteria, show only retrieved options, preserve unknown prices/availability and return a proposed selection. The user explicitly chooses whether to transfer it to an inquiry draft; no order, reservation, inventory write or free autonomous action. Handle cancel, timeout, retry, empty results and stale/deleted products before connecting a provider. Provider choice, data handling, contact retention/Kazakhstan readiness and separately approved intake enablement remain release gates. No LLM, messaging or intake enablement is part of this candidate.
