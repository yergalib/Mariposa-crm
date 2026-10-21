// Prepared locally, disabled unless explicitly activated on the approved Preview.
// Owner-approved extension through Oct25 inclusive; original flag/start retained for ledger continuity.
export const OWNER_DAY = {
  flag: "main-2026-10-21",
  project: "prj_FSsQxUktUBH9VNCGeadBoNnzlD1W",
  ref: "review/ai-header-preview-candidate-20261011",
  organizationId: "2157bde1-1994-465b-9f80-e1b740ee3cb1",
  resource: "jawposhuxaexoqzopgoq",
  membershipId: "c580c434-53c7-4f37-a388-da443c4e426e",
  timezone: "Asia/Almaty",
  start: Date.parse("2026-10-20T19:00:00Z"),
  initialUntil: Date.parse("2026-10-21T19:00:00Z"),
  until: Date.parse("2026-10-25T19:00:00Z"),
  priceAck: "gpt-6-luna:2026-10-20:standard:0.10:0.01:0.125:0.50",
  calls: 100, minuteCalls: 12, budgetNano: 2_000_000_000,
  // 128768 input at highest cache-write rate + 1400 output + 10% margin.
  // Includes the activation smoke: 100 total calls, not 100 + smoke.
  planningInputEstimate: 128_768, reservationNano: 18_475_600,
} as const;
export function ownerDayRequested(env: NodeJS.ProcessEnv = process.env) {
  return env.MARIPOSA_OWNER_DAY_TEST !== undefined;
}
export function ownerMainRestricted(env: NodeJS.ProcessEnv = process.env) {
  return ownerDayRequested(env) || env.STOREFRONT_ORGANIZATION_ID === OWNER_DAY.organizationId;
}
export function ownerDayConfig(env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  if (env.MARIPOSA_OWNER_DAY_TEST !== OWNER_DAY.flag || env.VERCEL_ENV !== "preview"
    || env.VERCEL_PROJECT_ID !== OWNER_DAY.project || env.VERCEL_GIT_COMMIT_REF !== OWNER_DAY.ref
    || env.STOREFRONT_ORGANIZATION_ID !== OWNER_DAY.organizationId
    || env.MARIPOSA_ASSISTANT_ORGANIZATION_ID !== OWNER_DAY.organizationId
    || env.MARIPOSA_ASSISTANT_OWNER_MEMBERSHIP_ID !== OWNER_DAY.membershipId
    || env.MARIPOSA_PILOT_HISTORY_TEST !== undefined || env.MARIPOSA_PILOT_TEST_RUN_ID !== undefined || env.MARIPOSA_ISOLATED_PREVIEW !== undefined
    || now < OWNER_DAY.start || now >= OWNER_DAY.until) return null;
  return { organizationId: OWNER_DAY.organizationId, membershipId: OWNER_DAY.membershipId,
    start: OWNER_DAY.start, until: OWNER_DAY.until, ref: OWNER_DAY.ref };
}
