# Home photographs from the user Downloads folder

## Correction before publication

IMG_9491.JPG is a portrait of a child in a blue dress, not a verified view of the actual showroom. Its placement in About was removed before publication. About is restored to the existing compact text-only section, with no image placeholder or reserved photo space. Three hero photographs remain unchanged. The unused PNG derivative is not referenced by the homepage; prior photo and seven-asset checks below document the preceding local candidate. Only About-targeted browser/markup checks and scoped lint were rerun for this correction; no full build or deployment.

Base: f8d99091739f41a5cd15bf74fa8df2263545896b, review/website-current-20261009. Local candidate only; no push/deployment.

## Source and selection

Only the user-named Downloads/фото для главной старницы сайта directory was inspected. All 37 images decoded and were visually reviewed on contact sheets; selected frames were also viewed individually. 35 are 2667×4000, one is 1706×2560 and IMG_6724.JPG is 853×1280. 36 are suitable for larger editorial placements; the smaller photo was not used. No Instagram extraction or generated imagery.

| Placement | Original | Reason |
| --- | --- | --- |
| Hero 1, pastel pair | IMG_9332.JPG | Clean neutral background and two light festive outfits |
| Hero 2, white dress | IMG_9420.JPG | Clear dress silhouette and light studio architecture |
| Hero 3, black dress | IMG_7100.JPG | Higher-resolution contrasting portrait; headpiece retained by adjusted object position |
| Existing About section | IMG_9491.JPG | Close detail of a blue outfit, used as one compact lazy-loaded photograph |

Originals were never overwritten. SHA-256 comparison of all 37 files passed after processing. Seven derivatives have stripped metadata and recorded dimensions/hashes in SHOWROOM_HERO_ASSETS_20261009.json. Six responsive WebP hero files are 26,398–77,166 bytes; About PNG is 296,273 bytes. The existing offline generation script validates exact input hashes and preserves source bytes. No retouching or text over photographs.

## Integration boundaries

Reuses existing exact public paths (pastel-pair, white-dress, black-dress desktop/mobile WebP and approved-studio.png); proxy.ts is unchanged. No auth/WAF/env/DB settings touched. No product IDs, catalog attributes, CRM image relationships or public-product validation were changed. Product and colour cards continue using their actual public CRM DTO photographs. The single editorial About photo creates no catalog association.

Existing section order, typography, compact benefits, four rental steps and hero 40/60 composition are preserved. Hero still has three slides, a 3000ms interval, pause/hover/focus/hidden-tab/manual navigation and reduced-motion behaviour. Reserve 112px for Pause/Resume to avoid a measured tiny control shift (0.0000488) when the longer label appears.

## Verification and evidence

- Browser: C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-browser-84BU2J — PASS; actual production React/CSS and supplied images with synthetic catalog only, zero POST requests. Every hero and About placement captured at 390/430/1440. Final pixels checked; headpieces retained, no horizontal overflow, stable stage, zero observed hero CLS during carousel interactions, 44px controls. Viewport-resize screenshots run after disconnecting the CLS observer. Initial attempts exposed clipping and the control shift, corrected before this passing run.
- C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-home-photos-final-LjZozJ — source/derivative integrity, home markup, carousel lifecycle, typecheck, lint, build and guest assets all PASS.
- C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-guest-assets-kbVGfY — real local production Next server/proxy: all seven images HTTP 200 without cookies, expected image MIME, byte-for-byte equality; unknown hero path and /orders remain 307 /login; /api/v1/orders remains 401. This is local guest HTTP verification, not a live deployed UI claim.
- C:/Users/AMELIE~1/AppData/Local/Temp/mariposa-home-photos-final-i2Wy5d — final lint/build after the last CSS-only stability correction. Minimal environment and non-listening dummy loopback DB URL; no real DB/provider requests.

Publication requires a separate authorization to push this candidate to the existing review/website-current-20261009 branch, then verify its Git-triggered Preview and existing stable alias. No new project/domain is needed. Production and live AI/intake are outside this candidate. Paid calls: 0. Deferred site-to-Pilot E2E was not run.

Correction evidence: %TEMP%/mariposa-browser-11oLJp — --about-only PASS, pixels reviewed at 390/430/1440; About heights 267.17/243.38/118.98px, zero images/placeholders, three hero slides, no overflow or POST. showroom-home-smoke PASS; scoped ESLint PASS. Hero configuration and image bytes unchanged relative to 6b4e613. No full build rerun, as requested.
