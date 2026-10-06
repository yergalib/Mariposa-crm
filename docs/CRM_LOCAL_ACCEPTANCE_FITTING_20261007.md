# Local fitting acceptance correction — 2026-10-07 Astana

Owner feedback: synthetic UUID labels, misleading UTC fixture timezone and horizontally overflowing fitting form obstructed acceptance.

Code changes: scoped fitting form/search layout; wrapping checkbox selection retaining repeated variantIds and selected archived snapshots; explicit branch timezone/UTC offset; result-limit guidance. Existing branch-local-to-UTC parser, fitting services, duration and stock rules were reused unchanged.

Acceptance-only data: crm_p0_acceptance_1791304768871, loopback 127.0.0.1:62317. Renamed only known synthetic labels (2 branches, 1 customer, 333 products, 206 executions, 3 staff display names); both synthetic branches now Asia/Almaty. Before-values are preserved in ../fitting-owner-feedback/acceptance-*-before.json. No source-fixture, credential, owner-session, stock, photo or owner-entered record changes.

Validation: separate Chrome profile, temporary synthetic DIRECTOR session, real local Next form. Russian choices contain no visible UUID; no document overflow at 390/1024/1440; two checkbox selections round-trip; 2090-01-03 01:30 Asia/Almaty saved as 2090-01-02T20:30:00.000Z, end exactly 30 minutes later and edit form restored 01:30. Targeted ESLint and existing P0 assembly TypeScript check passed. No broad regression/build repeat.

Evidence: ../fitting-owner-feedback/browser-result.json and fitting-390.png / fitting-1024.png / fitting-1440.png. Own verification fitting and session removed. An initial cleanup attempt correctly failed on immutable audit deletion; audit was preserved, no bypass/retry was attempted, and cleanup of the exact short-lived test session completed separately. Owner browser was never controlled.

The supplied Library JPEG could not be materialized: current official helper fails on Windows os.setxattr, so no claim of inspecting its original pixels. Local browser screenshots were inspected instead.

These corrections are local only. No push, main merge, deployment or live schema/env/security changes.
