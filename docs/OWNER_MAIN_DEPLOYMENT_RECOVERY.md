# Recovery of approved owner-day deployment

The first Vercel deployment of 25f02ea failed: the pre-existing isolated Preview rule applies by branch name, even when its opt-in flag is absent. The earlier local build omitted Vercel environment values and missed this conflict.

The recovery leaves that isolated rule intact. lib/env.ts selects a separate resource validator only when MAIN or owner-day is requested. That validator requires the exact approved ownerDayConfig, including Preview project/ref, MAIN tenant, owner membership, fixed Almaty window, and absence of Pilot/isolated flags. Invalid MAIN configurations throw instead of falling back. Database credentials must bind to the existing jawposhuxaexoqzopgoq endpoint/account and postgres database; diagnostics never include URL values. Existing TLS options are preserved; explicit downgrades are rejected. Storage requires the same validated configuration and exact project origin. Session/permission checks remain mandatory before catalogue/photo/history/handoff access.

Regression tests invoke the real environment resolver under approved Vercel env, reject wrong/missing flags, tenant/member/project/ref, foreign DB/Storage, TLS downgrade and expiry, and retain all SSR/API/photo/history/handoff/budget tests. Final local build uses those same nonsecret env settings with dummy credentials and a preloaded network denial, rather than silently testing a generic local environment. No real provider or database calls occur in local verification.

No changes to the approved window, call/budget limits, WAF/protection, provider key, production or main branch.
