# Responsive hero photograph delivery — 2026-10-09

Local follow-up includes the preserved ea07a21 baseline, e032782 customer-path changes and 82a0fa5 source correction. Nothing is published by this block.

## Owner scope and selected sources

The owner explicitly allowed selecting and using photos from Drive folder 1NHkBHAAQs490ZbyplBFPwRmcgtZO8NS5 and requested a three-second carousel with no embedded text. The full direct folder listing returned 57 entries (55 image files, plus HTML and text references). Six JPG originals and the existing PNG were visually inspected locally. No unrelated personal files were opened.

Selected editorial hero photos:
- IMG_9280.JPG, Drive 1Tpepv_nXZQM8PeYaYRgDkHlWR3rRdJ3a: two pastel dresses, cream and pink.
- IMG_9400.JPG, Drive 1lOsKMBY1G6Zi5xvM4FqhnXC5fi3xUmWG: full-length white layered dress.
- IMG_6724.JPG, Drive 1xMBUeqMicYmW-PpUG4JOlySxQfoxMPCB: full-length black dress.

Original files remain byte-for-byte in the sibling hero-assets-source-20261009 directory outside Git; Drive originals are unchanged. Source IDs, SHA256, dimensions, crop coordinates and derivative hashes are recorded in SHOWROOM_HERO_ASSETS_20261009.json. The old approved-studio.png remains preserved but is no longer a displayed slide. Product/execution relationships are not inferred from editorial pictures.

Authenticated Google Drive fetch returned file references; their download responses were saved locally for inspection. No permanent public Drive link, credential, signed transfer URL or private Storage record is included in the code or manifest.

## Assets and layout

Three desktop WebP files: 59,382 / 58,704 / 65,074 bytes (183,160 total). Three mobile files: 51,336 / 48,020 / 57,766 bytes (157,122 total). Each is under 66 KB. The original selected files total 5,444,542 bytes. Sharp 0.35.5 already present in the lockfile performs only orientation, deterministic crop/resize and WebP encoding (quality 84); output metadata stripped. No retouching, generated pixels, text or clothing alterations. Original lower-resolution black-dress photo is never upscaled.

Desktop framing is 4:5 with explicitly inspected crops; mobile retains each original vertical composition at 2:3. Faces, dresses and visible footwear remain in frame. The carousel stage reserves its responsive aspect ratio and uses contain; all slides share its bounds. Text/CTA remain outside the photograph. Only three bounded small assets load per viewport; browser picture/source chooses mobile variants, with first image high priority. Source dimensions and explicit stage sizing avoid image-load shifts. Controls remain at least 44px; pause control has stable width.

Reproduce assets offline: node scripts/showroom-hero-assets.cjs <preserved-original-directory>. It checks source hashes and file-size budget and never changes source files. No new dependency or external service was introduced.

## Verification and limits

- Existing lifecycle regression PASS: 3-second wrap, pause/resume, hover/focus, hidden page, manual dots/swipe/vertical cancellation, reduced motion, empty/single slides and cleanup.
- Rendered-home regression PASS with the new images; existing owner content/navigation still rendered.
- Real Edge at 1440px and 390px PASS: actual local photographs load, desktop/mobile currentSrc matches correct derivatives, three-second rotation, pause, reduced motion, stable image height, controls >=44px, no horizontal overflow, zero POST and runtime exceptions. Six screenshots inspected for representative desktop/mobile framing. Hero-specific observed layout shift is zero after fixing pause-label width; this is a scoped lab measurement, not deployed Core Web Vitals certification.
- TypeScript, scoped ESLint and final Next 16.3.8 build PASS (67 generated static pages; showroom remains dynamic). Build used sanitized env and a dummy non-listening loopback database URL.

Photo content is real owner-supplied; catalogue/availability in the local browser harness remain synthetic and Next navigation is adapted. No live CRM, Storage or Production operations. No push/deploy, LLM or intake change. Authorized live Preview verification is still blocked by the absence of an authenticated Vercel browser session for this agent.

No verified real-showroom interior was identified among the inspected source selection: the sculptural backgrounds belong to studio portraits and are not evidence of the Local shop interior. About/Contacts retain their honest placeholders. Remaining uninspected folder images are not declared absent or unsuitable; a verified shop photograph remains the only unresolved image-content item here.
