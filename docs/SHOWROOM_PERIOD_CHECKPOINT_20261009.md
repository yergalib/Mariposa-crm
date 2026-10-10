# Unified rental period — local checkpoint

Completes the existing uncommitted RentalDateRange work on review/website-current-20261009. One summary opens a native modal with a compact DayPicker range and explicit local times. Apply/Cancel/Clear, Escape and focus return; no invented hours or outer datetime duplicates. Partial start remains supported. Existing branch, URL and availability logic is reused.

Fresh synthetic Edge test: node scripts/showroom-browser-local.cjs --period-only PASS. Real production React/CSS, all root styles loaded, synthetic catalog/API, zero POSTs. Widths 390/430/1440, 7 columns, 44px cells, 308px calendar, no overflow. Covers cancel/reopen, clear/partial, keyboard/Escape focus, URL/product/Back, timezone America/Los_Angeles with Asia/Almaty branch, and availability invalidation only on Apply. Screenshots reviewed for catalog and product at all three widths. Initial evidence: %TEMP%/mariposa-browser-UwZWjk. Pixel review found parent product typography/paragraph overrides; scoped specificity strengthened and the browser test rerun before commit.

No Core, schema, environment, deployment, paid model or smoke-checkpoint changes.
