# Showroom visual correction — 9 October 2026

Local correction above `cad4c7d7537afa747bc655225a2fdeb80ee026d0`. The assistant smoke checkpoint is preserved separately and remains inactive. No publish, push, database, credentials, environment or authentication changes.

## Result

- Home cards contain the original product name (two visible lines), photograph, real supplied price summary or “Уточнить стоимость”, and an accessible 44px favourite control over the image. No home size lists, unknown colour labels or inventory metadata. Full product names and sizes remain available on the product page.
- The home strip displays up to four photographed public dress groups. It does not fill empty positions with placeholders. The existing bounded representative-photo scan is reused once for products and colour navigation, with unchanged tenant, public branch, active category, rentable variant and protected image rules. A missing colour no longer excludes an otherwise eligible photographed product; colour navigation still requires a confirmed colour. No price is inferred without a branch.
- A centred 1280px canvas and contiguous 40/60 hero replace the narrow right-aligned image. The photo stage fills its column; editorial images use cover, while product photographs retain contain. Mobile heading 40px; header 72px; two 173px home cards at 390px. Cormorant/Onest and approved logo/assets retained.
- Four approved benefit titles form a compact strip / mobile 2×2 grid. Repeated descriptions and the large placeholder about photograph are removed. Rental steps, helper invitation, about text, header and footer use consistent spacing.
- Catalogue filters are an accessible native disclosure; GET filters and links are preserved. Catalogue/recommendation names and catalogue size summaries are visually bounded; the full data remains on the product page. Product gallery fills its column without cropping the product photograph.

## Evidence and limits

- `tsc --noEmit`: PASS. Full ESLint: 0 errors, seven existing warnings outside showroom. Changed TS/TSX files also linted separately.
- Final `next build`: PASS (67 generated static pages). Clean child environment; only a fictional database address at localhost port 1. No live database or provider.
- `showroom-home-smoke.cjs`, `showroom-color-representatives-smoke.cjs`: PASS. Includes unknown-colour photographed products, missing public branch, unavailable category, bounded scan, and unchanged protected-photo query predicates with a synthetic DB adapter.
- `showroom-browser-local.cjs --editorial-only`: PASS, local headless Edge. Real React components/CSS and local fonts/owner editorial images; fictional product associations, 12 sizes, long names, partial photographs. Widths 390/430/1440/1920, home/catalog/product; 12 full-page screenshots plus four home viewports and geometry JSON. No horizontal overflow; two-line home names, 44px hearts, persistent favourite toggling without navigation, empty and broken-image fallback; zero POST requests or browser exceptions.
- Existing `showroom-browser-local.cjs`: PASS. Catalogue filters → exact product/size/dates, synthetic price/availability, cancellation, unsent fitting draft, favourites, menu Escape and helper opening. No live traffic or writes.
- Pixel inspection caught and corrected a product-gallery height cap that cropped the lower photograph. Final images preserve the full product photo. Evidence directory outside git: `../visual-review-20261009/final/`, names `editorial-{390,430,1440,1920}-{home,catalog,product}-full.png`.
- These screenshots render the actual UI implementation with fixture data, not a deployed website or verified live CRM/photo association. Live Preview remains at its previously published commit. No claim of full E2E/security audit or user visual acceptance.
- User Library screenshots: metadata/OCR read; supported materialization returned HTTP 403, with no bypass. Saving the final image batch through the current Library helper failed before upload because its hosted runtime reports `prepare_uploads` unavailable. No confirmed Library file IDs; local screenshots retained.

Reference brief supplied by the parent: Next.js Commerce `components/grid/three-items.tsx`, `components/label.tsx`, `components/product/product-description.tsx` (github.com/vercel/commerce), and COS dress catalogue. Adopted layout principles, not source code, brand assets or a backend. No new dependencies or downloaded commerce runtime.

## Catalogue follow-up after accepted home review

The catalogue now uses the existing icon-only favourite control over each photograph, and a short “Выбрать размер” product link instead of a truncated list of sizes. The full size selector and existing filter retain their values; product links preserve branch, size and dates. No home or backend changes in this follow-up. Instagram reference findings are pending and have not been inferred or implemented.

Targeted verification: typecheck and changed-file ESLint PASS; rendered home/catalog regression PASS; `showroom-browser-local.cjs --catalog-detail-only` PASS at 390/430/1440/1920. Verified compact cards, favourite toggling without navigation, open filter/calendar containment, preserved dates, exact-size product navigation, real-image second gallery frame, thumbnails and keyboard navigation. `--widgets-only` also PASS: calendar apply/cancel/clear/reopen, Escape/focus, civil dates in another browser timezone, gallery touch swipe and reduced motion. Both browser runs use synthetic products and zero POST requests.

20 new images (12 full-page + 8 calendar/gallery viewports) are saved outside git in `../visual-review-20261009/catalog-followup/`, named `catalog-detail-{width}-{catalog-full,filters-calendar-full,calendar-viewport,gallery-second-full,gallery-second-viewport}.png`. Actual local components and owner editorial photos; fictional product/photo associations. Screenshot pixels inspected, including mobile calendar and second-frame gallery. Full application build was already successful for the preceding block; this narrowly scoped follow-up used targeted checks rather than repeating the full audit. No deployment or Library upload attempted.
