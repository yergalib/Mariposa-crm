-- DRAFT: not applied. Release requires resolving the existing product-sheet
-- migration history gap and separate approval for Production changes.
CREATE TABLE "rental_document_versions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_user_id" UUID NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "template_version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "revision_reason" VARCHAR(500),
  CONSTRAINT "rental_document_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rental_documents_versions_check" CHECK (version > 0 AND schema_version > 0 AND template_version > 0),
  CONSTRAINT "rental_documents_reason_check" CHECK (version = 1 OR length(btrim(revision_reason)) > 0 AND revision_reason IS NOT NULL),
  CONSTRAINT "rental_documents_snapshot_check" CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT "rental_documents_hash_check" CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "rental_documents_organization_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rental_documents_branch_fkey" FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rental_documents_order_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rental_documents_actor_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "rental_documents_order_version_key" ON rental_document_versions(organization_id, order_id, version);
CREATE UNIQUE INDEX "rental_documents_request_key" ON rental_document_versions(organization_id, order_id, idempotency_key);
CREATE INDEX "rental_documents_branch_order_idx" ON rental_document_versions(organization_id, branch_id, order_id);

CREATE FUNCTION public.guard_rental_document_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Saved rental document versions are immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o JOIN public.branches b ON b.id = o.branch_id
    WHERE o.id = NEW.order_id AND o.organization_id = NEW.organization_id
      AND o.branch_id = NEW.branch_id AND b.organization_id = NEW.organization_id
      AND o.type = 'RENTAL'
  ) THEN
    RAISE EXCEPTION 'Rental document order context mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.created_by_user_id
      AND m.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Rental document actor context mismatch';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_rental_document_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rental_documents_guard BEFORE INSERT OR UPDATE OR DELETE
ON public.rental_document_versions FOR EACH ROW EXECUTE FUNCTION public.guard_rental_document_version();
CREATE TRIGGER rental_documents_no_truncate BEFORE TRUNCATE
ON public.rental_document_versions FOR EACH STATEMENT EXECUTE FUNCTION public.guard_rental_document_version();
ALTER TABLE public.rental_document_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_document_versions FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.rental_document_versions FROM service_role;
