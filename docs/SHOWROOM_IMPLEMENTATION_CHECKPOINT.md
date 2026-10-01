# Client showroom: shell, home and catalogue

Owner resumed implementation without waiting for photos/prices (2026-10-01, parent handoff 12:54 UTC). Approved 10-page prototype remains the reference; the four benefit texts use the final owner revision, not the older PDF wording.

## Implemented locally

- `/showroom`: full responsive home, original brand asset, hero, occasion entry, public dress sample, benefits, rental steps, optional assistant, owner-provided brand story and Local/Astana contacts.
- `/showroom?view=catalog`: native GET search/pagination/category navigation; existing nested category work preserved. Optional branch/size/colour/date panel calls the existing public catalogue API. Leaf category selection is explicit for a parent category; no silent broadening. Results reuse size/availability cards and the inquiry-only form.
- Product links and back navigation retain browse filters. Existing product selection, tenant/publication filters, availability calculation, inquiry guards and PILOT assistant authorization/privacy gates remain in place.
- Occasion buttons put a predefined event into the assistant draft; no automatic request. Conversation opens without mandatory calendar. Optional explicit date/time selection and cancellation protection remain. This does not implement the future full AI scenario.
- Public contact facts: Local, Astana, Alihan Bokeikhan 25b, basement, daily 11:00–20:00, owner WhatsApp/Instagram/2GIS. No inferred ordinary-call number, entrance directions, booking slots or financial policy.

## Limits, not completed features

- No photos fabricated. Branded empty photo areas have accessible labels; real-photo desktop/iPhone visual QA remains required.
- Browse DTO has no price or size list: cards link to details with “Уточнить стоимость”. Exact sizes/prices/availability come through existing selection DTO/API after explicit criteria. No added pricing or availability backend.
- “Популярные платья” currently shows up to four public dress model/execution groups from the existing bounded browse result. No popularity ranking/statistics. Owner-curated selection still required before launch.
- Date selection supports exact size label, not inferred age/height. Occasion is assistant/staff context, not a catalogue matching claim. Price-range filtering is not exposed because the existing public browse contract has no such capability; avoid filtering only one page and presenting it as global results.
- Favorites, fitting scheduling, actual similar/accessory photo cards and full approved AI remain subsequent stages. No fake buttons for unimplemented favorites or fabricated policy links.
- Earlier unfinished login/conversation-storage work remains separate and is not claimed complete.

## Verification and release status

- `tsc --noEmit`: passed.
- `next build`: passed with process-local synthetic localhost database URL; no real DB access, migration, seed, install or credential changes.
- Full ESLint: zero errors, seven pre-existing warnings in CRM photo/navigation files; changed showroom files clean.
- Synthetic-only smoke checks: rendered home/catalogue, existing narrow public DTO and tenant/production guards, free conversation entry + optional calendar + cancel/stale-response protection, outfit selection and inquiry retry. No provider calls or actual writes.
- Built app started locally on loopback for HTTP checks: home renders without configured tenant; catalogue safely reports unavailability. This does not validate live PILOT data or full browser layout.
- No browser automation used to bypass the existing credential-observation restriction. No new screenshots or PDF. Public working Preview remains unpublished because the publication approval blocker remains active; no push/retry/alternate hosting route used.

Prior local changes were backed up outside the repo at `../site-resume-checkpoint` before this stage. Original checkout and separate CRM worktree were not touched.
