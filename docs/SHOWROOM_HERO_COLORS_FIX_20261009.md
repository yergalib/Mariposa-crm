# Hero guest access and colour representatives — local fix

Base: 0f3518abaf745e060203d7bfda6890b888c6a4a2, review/website-current-20261009.

## Confirmed causes and changes

- proxy.ts allowed only the old hero PNG; the six tracked WebP paths used by HeroCarousel fell through to CRM login for guests. Added exactly those six paths, not a directory wildcard. No CRM authentication logic changed.
- Home colour cards previously consumed only the first 12 catalogue groups and discarded every Other group. A separate server-only representative read now examines the entire eligible dress-group set under the same tenant, public-branch, active-category, rental/publication and execution gates. It has the same explicit 2000-group bound as colour filtering; exceeding it suppresses this optional section instead of silently using page one. Photo metadata is batched in groups of 50, with the same publicPhotos restrictions and protected rendition route. No storage key or private DTO is returned.
- The existing conservative resolver is shared with catalogue filters. Recognized single colours outside the named buckets (milk, ivory, yellow, gold, etc.) may represent Other; they are not relabelled white or beige. Unknown/mixed descriptors remain excluded from representative cards. Execution precedence is unchanged; no photo/AI inference or CRM data correction.
- The colour section is omitted when there are no representatives, including load failure. The ordinary catalogue CTA remains. Home product cards retain their existing first-page sample.

## Completed verification

- Standalone TypeScript and scoped ESLint: PASS.
- Next 16.3.8 build: PASS, 67 static pages. Sanitized process environment, dummy non-listening loopback DATABASE_URL; no real DB credentials or operations.
- scripts/showroom-home-smoke.cjs: PASS; hidden empty section, independent representative props, execution precedence, missing/mixed/unknown exclusion, known Other colours.
- scripts/showroom-color-representatives-smoke.cjs: PASS using the real service/photo code with a synthetic DB adapter. Representatives after group 12, bounded photo query, publication/tenant/category guards, no-public-branch and invalid-category empty states, over-limit failure. This is not a real database integration test.
- scripts/showroom-guest-assets-smoke.cjs: PASS against the actual built Next server without cookies. All six WebP responses HTTP200 image/webp, no Location, valid RIFF/WEBP and byte-for-byte equal to tracked assets (59382, 51336, 58704, 48020, 65074, 57766 bytes). /orders and unapproved hero path still 307 /login; /api/v1/orders remains 401. Evidence: %TEMP%/mariposa-guest-assets-31gRKr/results.json and server.log.
- scripts/showroom-browser-local.cjs --hero-only: PASS, real hero bytes with synthetic catalogue; desktop1440/mobile390, all three slides, correct responsive sources, autoplay/pause/reduced motion, stable stage, zero observed hero CLS, 44px controls, no horizontal overflow/runtime errors/POST. Evidence: %TEMP%/mariposa-browser-60wiQi; six screenshots. Desktop first slide and mobile third slide visually inspected. Browser harness uses adapters; guest middleware delivery is independently covered by the built Next test above.
- Initial browser sandbox attempt failed on esbuild ancestor access; authorized local rerun passed. Initial guest test assertion did not handle a relative /login redirect; corrected test then passed. No unresolved application test failure.

## Limits and release boundary

Live CRM colour attributes and rendition availability were not queried, so the exact data trigger for the owner's empty section remains unconfirmed. If no confirmed descriptors/photos exist, data curation is still needed; the UI will not fabricate cards. Real iPhone Safari and deployed fix are untested.

The two supplied Library screenshots could not be materialized: the current supported helper returned HTTP403 for both. Their pixels were not inspected here; the reported symptoms were independently reproduced/verified in source and local tests.

No push/deploy, WAF/auth/env changes, database writes or migrations. Intake and LLM gates untouched. Publication requires separate authorization.
