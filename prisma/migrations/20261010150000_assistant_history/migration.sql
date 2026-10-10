-- Local candidate only. Rehearse solely in the verified isolated PostgreSQL runtime.
CREATE TABLE assistant_conversations (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 owner_hash char(64) NOT NULL, principal varchar(64) NOT NULL, channel varchar(16) NOT NULL DEFAULT 'WEB' CHECK(channel='WEB'),
 policy varchar(40) NOT NULL, consented_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL,
 snapshot jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0), creation_key uuid NOT NULL, creation_hash char(64) NOT NULL,
 inquiry_id uuid UNIQUE REFERENCES inquiries(id) ON DELETE RESTRICT, handoff_key uuid, handoff_hash char(64), handed_off_at timestamptz(3),
 CONSTRAINT assistant_history_expiry CHECK(expires_at>consented_at AND expires_at<=consented_at+interval '7 days'),
 CONSTRAINT assistant_history_receipt CHECK((inquiry_id IS NULL AND handoff_key IS NULL AND handoff_hash IS NULL AND handed_off_at IS NULL) OR (inquiry_id IS NOT NULL AND handoff_key IS NOT NULL AND handoff_hash IS NOT NULL AND handed_off_at IS NOT NULL)),
 CONSTRAINT assistant_history_owner UNIQUE(organization_id,owner_hash,principal,channel),
 CONSTRAINT assistant_history_creation UNIQUE(organization_id,creation_key)
);
CREATE INDEX assistant_history_expiry_idx ON assistant_conversations(expires_at,id);
CREATE TABLE assistant_messages (
 conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
 ordinal integer NOT NULL CHECK(ordinal>=0 AND ordinal<64), role varchar(16) NOT NULL CHECK(role IN('user','assistant')),
 content varchar(700) NOT NULL, PRIMARY KEY(conversation_id,ordinal)
);
CREATE TABLE assistant_history_quotas (key char(64) NOT NULL,window_start timestamptz(3) NOT NULL,count integer NOT NULL CHECK(count>0),PRIMARY KEY(key,window_start));
CREATE INDEX assistant_history_quota_expiry_idx ON assistant_history_quotas(window_start);
CREATE FUNCTION assistant_history_tenant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Conversation branch tenant mismatch'; END IF;
 IF NEW.inquiry_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inquiries WHERE id=NEW.inquiry_id AND organization_id=NEW.organization_id AND branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'Conversation inquiry tenant mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assistant_history_tenant_guard BEFORE INSERT OR UPDATE ON assistant_conversations FOR EACH ROW EXECUTE FUNCTION assistant_history_tenant_guard();
