CREATE TABLE login_attempt_buckets (key varchar(80) PRIMARY KEY, attempts integer NOT NULL CHECK (attempts > 0), window_ends_at timestamptz(3) NOT NULL);
CREATE INDEX login_attempt_buckets_window_ends_at_idx ON login_attempt_buckets(window_ends_at);
ALTER TABLE login_attempt_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_attempt_buckets FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON login_attempt_buckets FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON login_attempt_buckets FROM authenticated; END IF; END; $$;
-- Unknown identities have no tenant. Keep them in the existing append-only audit
-- with a narrow global-auth exception; tenant audit queries remain tenant scoped.
ALTER TABLE audit_logs ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE audit_logs ADD CONSTRAINT audit_global_auth_only CHECK (organization_id IS NOT NULL OR (source='SYSTEM' AND entity_type='Authentication' AND action IN ('AUTH_LOGIN_DENIED','AUTH_LOGIN_THROTTLED','AUTH_LOGIN_FAILED')));
