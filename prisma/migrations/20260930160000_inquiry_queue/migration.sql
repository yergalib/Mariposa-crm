-- DRAFT ONLY: do not apply before the existing Prisma history gap is resolved
-- and this migration is approved. No channel integrations or stock operations.
CREATE TYPE "InquirySource" AS ENUM ('CRM', 'WEBSITE', 'TELEGRAM', 'WHATSAPP', 'PHONE', 'OTHER');
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED');
CREATE TABLE public.inquiries (
  id UUID NOT NULL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  source "InquirySource" NOT NULL DEFAULT 'CRM',
  status "InquiryStatus" NOT NULL DEFAULT 'NEW',
  subject VARCHAR(200) NOT NULL,
  customer_label VARCHAR(120), request_text VARCHAR(2000), requested_size VARCHAR(100),
  requested_from TIMESTAMPTZ(3), requested_until TIMESTAMPTZ(3),
  assigned_membership_id UUID REFERENCES public.organization_memberships(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  next_action VARCHAR(500), next_action_at TIMESTAMPTZ(3),
  created_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  creation_key UUID NOT NULL, creation_hash CHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  closed_at TIMESTAMPTZ(3),
  CONSTRAINT inquiries_subject_check CHECK (length(btrim(subject)) > 0),
  CONSTRAINT inquiries_version_check CHECK (version > 0),
  CONSTRAINT inquiries_hash_check CHECK (creation_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT inquiries_period_check CHECK ((requested_from IS NULL AND requested_until IS NULL) OR
    (requested_from IS NOT NULL AND requested_until IS NOT NULL AND requested_from < requested_until)),
  CONSTRAINT inquiries_next_action_check CHECK (next_action_at IS NULL OR (next_action IS NOT NULL AND length(btrim(next_action)) > 0)),
  CONSTRAINT inquiries_closed_check CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX inquiries_creation_key ON public.inquiries(organization_id, creation_key);
CREATE INDEX inquiries_queue_idx ON public.inquiries(organization_id, branch_id, status, created_at);
CREATE INDEX inquiries_assignee_idx ON public.inquiries(organization_id, assigned_membership_id, next_action_at);
CREATE TABLE public.inquiry_items (
  id UUID NOT NULL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE ON UPDATE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name_snapshot TEXT NOT NULL, sku_snapshot TEXT NOT NULL, size_snapshot TEXT NOT NULL
);
CREATE UNIQUE INDEX inquiry_items_variant_key ON public.inquiry_items(inquiry_id, product_variant_id);
CREATE INDEX inquiry_items_tenant_idx ON public.inquiry_items(organization_id, inquiry_id);

CREATE FUNCTION public.guard_inquiry_context() RETURNS trigger
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
  IF NOT EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id = NEW.organization_id AND user_id = NEW.created_by_user_id)
    THEN RAISE EXCEPTION 'Inquiry creator context mismatch'; END IF;
  IF NEW.assigned_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships WHERE id = NEW.assigned_membership_id AND organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'Inquiry assignee context mismatch'; END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.guard_inquiry_item_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inquiries WHERE id = NEW.inquiry_id AND organization_id = NEW.organization_id)
    OR NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = NEW.product_variant_id AND organization_id = NEW.organization_id)
  THEN RAISE EXCEPTION 'Inquiry item context mismatch'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_inquiry_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_inquiry_item_context() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER inquiries_context BEFORE INSERT OR UPDATE ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.guard_inquiry_context();
CREATE TRIGGER inquiry_items_context BEFORE INSERT OR UPDATE ON public.inquiry_items
FOR EACH ROW EXECUTE FUNCTION public.guard_inquiry_item_context();
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inquiries, public.inquiry_items FROM PUBLIC, anon, authenticated;
