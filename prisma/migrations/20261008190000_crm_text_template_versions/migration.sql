-- LOCAL CANDIDATE ONLY: applying this in Production requires separate explicit approval.
-- Additive scope: one template table, indexes, guard function/triggers and its grants.
-- No existing rows, permission bundles, snapshots, operational tables or data are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE public.crm_text_template_versions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
  kind VARCHAR(40) NOT NULL CHECK (kind IN ('RENTAL_NOTE','RENTAL_PERIOD','PLANNED_RETURN','SALE_HANDOVER')),
  version INTEGER NOT NULL CHECK (version > 0),
  renderer_version INTEGER NOT NULL DEFAULT 1 CHECK (renderer_version = 1),
  body VARCHAR(1200) NOT NULL CHECK (length(btrim(body)) > 0),
  content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  state VARCHAR(12) NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','APPROVED','ARCHIVED')),
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ(3),
  approved_by_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  archived_at TIMESTAMPTZ(3),
  archived_by_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT template_approval_pair CHECK ((approved_at IS NULL) = (approved_by_user_id IS NULL)),
  CONSTRAINT template_archive_pair CHECK ((archived_at IS NULL) = (archived_by_user_id IS NULL)),
  CONSTRAINT template_state_facts CHECK (
    (state='DRAFT' AND approved_at IS NULL AND archived_at IS NULL) OR
    (state='APPROVED' AND approved_at IS NOT NULL AND archived_at IS NULL) OR
    (state='ARCHIVED' AND archived_at IS NOT NULL))
);
CREATE UNIQUE INDEX crm_text_template_versions_organization_id_idempotency_key_key ON public.crm_text_template_versions(organization_id,idempotency_key);
CREATE INDEX crm_text_template_versions_organization_id_branch_id_kind_version_idx ON public.crm_text_template_versions(organization_id,branch_id,kind,version);
CREATE UNIQUE INDEX crm_text_template_scope_version_key ON public.crm_text_template_versions(organization_id,COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),kind,version);
CREATE UNIQUE INDEX crm_text_template_active_key ON public.crm_text_template_versions(organization_id,COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),kind) WHERE state='APPROVED';

CREATE FUNCTION public.guard_crm_text_template_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Template versions cannot be deleted or purged'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'DRAFT' THEN RAISE EXCEPTION 'New templates must be unapproved drafts'; END IF;
    actor:=NEW.created_by_user_id;
  ELSE
    IF (NEW.id,NEW.organization_id,NEW.branch_id,NEW.kind,NEW.version,NEW.renderer_version,NEW.body,NEW.content_hash,NEW.idempotency_key,NEW.created_at,NEW.created_by_user_id)
      IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.branch_id,OLD.kind,OLD.version,OLD.renderer_version,OLD.body,OLD.content_hash,OLD.idempotency_key,OLD.created_at,OLD.created_by_user_id) THEN
      RAISE EXCEPTION 'Template content and provenance are immutable; append a version';
    END IF;
    IF OLD.state='DRAFT' AND NEW.state='APPROVED' THEN
      IF NEW.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Approval cannot archive'; END IF;
      actor:=NEW.approved_by_user_id;
    ELSIF OLD.state IN ('DRAFT','APPROVED') AND NEW.state='ARCHIVED' THEN
      IF (NEW.approved_at,NEW.approved_by_user_id) IS DISTINCT FROM (OLD.approved_at,OLD.approved_by_user_id) THEN RAISE EXCEPTION 'Approval provenance cannot change'; END IF;
      actor:=NEW.archived_by_user_id;
    ELSE RAISE EXCEPTION 'Invalid template state transition';
    END IF;
  END IF;
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=NEW.branch_id AND b.organization_id=NEW.organization_id AND b.status='ACTIVE') THEN RAISE EXCEPTION 'Template branch context mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.users u ON u.id=m.user_id JOIN public.organizations o ON o.id=m.organization_id WHERE m.organization_id=NEW.organization_id AND m.user_id=actor AND m.status='ACTIVE' AND u.status='ACTIVE' AND o.status='ACTIVE') THEN RAISE EXCEPTION 'Template actor context mismatch'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_crm_text_template_version() FROM PUBLIC;
CREATE TRIGGER crm_text_template_guard BEFORE INSERT OR UPDATE OR DELETE ON public.crm_text_template_versions FOR EACH ROW EXECUTE FUNCTION public.guard_crm_text_template_version();
CREATE TRIGGER crm_text_template_no_purge BEFORE TRUNCATE ON public.crm_text_template_versions FOR EACH STATEMENT EXECUTE FUNCTION public.guard_crm_text_template_version();
ALTER TABLE public.crm_text_template_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_text_template_versions FROM PUBLIC;
-- Standalone local PostgreSQL has no Supabase API roles. Do not create cluster roles.
DO $$ DECLARE api_role TEXT; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.crm_text_template_versions FROM %I',api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.guard_crm_text_template_version() FROM %I',api_role);
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE ON public.crm_text_template_versions TO service_role;
    REVOKE DELETE,TRUNCATE ON public.crm_text_template_versions FROM service_role;
  END IF;
END; $$;
COMMIT;
