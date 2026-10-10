-- Candidate only. Existing isolated PostgreSQL rehearsal; never live activation.
CREATE TABLE assistant_provider_attempts (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL, lease_until timestamptz(3) NOT NULL,
 input_bytes integer NOT NULL CHECK(input_bytes BETWEEN 1 AND 48000),
 output_token_cap integer NOT NULL CHECK(output_token_cap BETWEEN 1 AND 1400)
);
CREATE INDEX assistant_provider_window_idx ON assistant_provider_attempts(organization_id,created_at,membership_id);
ALTER TABLE assistant_provider_attempts ENABLE ROW LEVEL SECURITY;
-- No public policies or grants: only the existing privileged server DB connection.
