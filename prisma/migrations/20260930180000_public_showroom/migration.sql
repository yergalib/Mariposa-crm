BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- DRAFT ONLY. No production application; Prisma history blocker remains unresolved.
-- Existing and future products remain private unless an employee explicitly opts in.
ALTER TABLE public.products ADD COLUMN show_on_website BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.inquiries ADD COLUMN reply_contact VARCHAR(254);
ALTER TABLE public.inquiries ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_anonymous_origin_check CHECK (
  created_by_user_id IS NOT NULL OR
  (source = 'WEBSITE' AND reply_contact IS NOT NULL AND length(btrim(reply_contact)) BETWEEN 5 AND 254)
);
CREATE INDEX inquiries_source_created_idx ON public.inquiries(organization_id, source, created_at);
CREATE OR REPLACE FUNCTION public.guard_inquiry_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.organization_id, NEW.branch_id, NEW.source, NEW.created_by_user_id, NEW.creation_key, NEW.creation_hash, NEW.created_at)
      IS DISTINCT FROM (OLD.organization_id, OLD.branch_id, OLD.source, OLD.created_by_user_id, OLD.creation_key, OLD.creation_hash, OLD.created_at)
    THEN RAISE EXCEPTION 'Inquiry origin is immutable'; END IF;
    IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Inquiry version must advance'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = NEW.branch_id AND organization_id = NEW.organization_id)
    THEN RAISE EXCEPTION 'Inquiry branch context mismatch'; END IF;
  IF NEW.created_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = NEW.organization_id AND user_id = NEW.created_by_user_id)
    THEN RAISE EXCEPTION 'Inquiry creator context mismatch'; END IF;
  IF NEW.assigned_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships WHERE id = NEW.assigned_membership_id AND organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'Inquiry assignee context mismatch'; END IF;
  RETURN NEW;
END;
$$;

-- Existing RLS, grants, FK and immutable-origin/version guards are preserved.
-- No anonymous database grants, public policies, seeds, or publication updates.

COMMIT;
