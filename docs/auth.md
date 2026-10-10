# Authentication and authorization

MARIPOSA CRM owns its authentication data. Supabase is used only as the current
PostgreSQL host; no Supabase Auth identity is required, so the database can move
without replacing the authentication model.

## Passwords and login

Users sign in with a normalized lowercase email and password. Passwords are
hashed with Argon2id and the hash never leaves server code. Invalid email,
inactive user, inactive tenant, inactive membership and invalid password all
return the same generic error. An intentionally invalid Argon2id hash keeps
unknown-email attempts on the expensive password verification path.

The initial owner is optional seed data. The seed creates it only when
`SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` and `SEED_OWNER_NAME` are all set. It
never prints the password and never resets the password of an existing user.

## Shared login limits and audit

Login attempts use atomic PostgreSQL counters shared across workers and request
sources: 10 attempts per normalized identity in 15 minutes and 200 attempts
across the application in one minute. Both successful and unsuccessful attempts
consume the window; retry is possible after it expires. These fixed limits can
temporarily deny legitimate login during abusive traffic. Forwarded IP headers
are not trusted, and no external limiter is required. Counters store a SHA-256
identity key, not an email or password; windows and expiry use the database clock.

Accepted credentials and denied attempts enter the existing append-only audit.
Known membership events stay tenant-scoped. Unknown or throttled requests use a
narrow SYSTEM/Authentication global audit exception and are not exposed by tenant
audit views. Audit metadata contains no submitted email, password or cookie.
An unavailable counter or audit dependency fails login closed with the same public
error. The isolated-only migration is 20261010150000_login_attempt_limits; it must
be applied through a separately authorized release before this code runs elsewhere.

## Database sessions

On successful login the server generates 32 cryptographically random bytes. The
raw token is stored only in the `mariposa_session` cookie. PostgreSQL stores its
SHA-256 hash in `auth_sessions`, along with `userId`, `membershipId`,
`organizationId`, expiration and revocation timestamps.

The cookie is HttpOnly, SameSite=Lax, path `/`, high priority, and Secure in
production. Sessions expire after 12 hours. Logout revokes the database row
before expiring the cookie.

## Trusted tenant context

Every protected server render loads the session from PostgreSQL and verifies:

- the session is not expired or revoked;
- user, organization and membership are active;
- membership user and organization match the session row.

The resulting server-side context contains `userId`, `organizationId`,
`membershipId`, `role` and `defaultBranchId`. Future business queries must use
that `organizationId`; a tenant ID supplied by the browser is never authoritative.

## Roles and route access

The membership stores one Stage 2 role: `OWNER`, `DIRECTOR`, `CASHIER` or
`SELLER`. `lib/auth/access.ts` is the central temporary route policy. Sidebar
filtering uses the same policy for usability, while `AppShell` independently
enforces it on the server. Settings are OWNER-only.

Next.js `proxy.ts` performs only an optimistic cookie-presence redirect. It does
not replace database authorization. Server Actions, Route Handlers and future
data-access functions must call the server-side session/authorization layer.

## Deferred security work

- adaptive/progressive delay beyond the shared fixed login windows;
- MFA for OWNER accounts;
- password reset and email verification;
- broader security-event coverage beyond login attempts;
- active-device/session management and logout-all;
- configurable roles and granular permissions;
- periodic cleanup of expired and revoked sessions;
- stronger database constraints or RLS for tenant consistency.
