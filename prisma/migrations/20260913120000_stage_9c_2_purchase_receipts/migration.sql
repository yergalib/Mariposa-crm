CREATE TABLE "purchase_receipts" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID NOT NULL, "purchase_id" UUID NOT NULL,
 "branch_id" UUID NOT NULL, "location_id" UUID NOT NULL, "receipt_number" VARCHAR(60) NOT NULL,
 "received_at" TIMESTAMPTZ(3) NOT NULL, "received_by_user_id" UUID, "received_by_membership_id" UUID,
 "idempotency_key" VARCHAR(150) NOT NULL, "note" VARCHAR(1000), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY("id"),
 CONSTRAINT "purchase_receipts_organization_id_fkey" FOREIGN KEY("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "purchase_receipts_purchase_id_fkey" FOREIGN KEY("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "purchase_receipts_branch_id_fkey" FOREIGN KEY("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "purchase_receipts_location_id_fkey" FOREIGN KEY("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "purchase_receipts_received_by_user_id_fkey" FOREIGN KEY("received_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "purchase_receipts_received_by_membership_id_fkey" FOREIGN KEY("received_by_membership_id") REFERENCES "organization_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "purchase_receipts_organization_id_receipt_number_key" ON "purchase_receipts"("organization_id","receipt_number");
CREATE UNIQUE INDEX "purchase_receipts_organization_id_idempotency_key_key" ON "purchase_receipts"("organization_id","idempotency_key");
CREATE INDEX "purchase_receipts_organization_id_purchase_id_received_at_idx" ON "purchase_receipts"("organization_id","purchase_id","received_at");
CREATE INDEX "purchase_receipts_organization_id_branch_id_received_at_idx" ON "purchase_receipts"("organization_id","branch_id","received_at");

CREATE TABLE "purchase_receipt_lines" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID NOT NULL, "purchase_receipt_id" UUID NOT NULL,
 "purchase_item_id" UUID NOT NULL, "product_variant_id" UUID NOT NULL, "quantity" INTEGER NOT NULL,
 "unit_acquisition_cost_minor" BIGINT NOT NULL, "total_acquisition_cost_minor" BIGINT NOT NULL, "currency" CHAR(3) NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY("id"), CONSTRAINT "purchase_receipt_lines_values_check" CHECK("quantity">0 AND "unit_acquisition_cost_minor">=0 AND "total_acquisition_cost_minor">=0),
 CONSTRAINT "purchase_receipt_lines_currency_check" CHECK("currency" ~ '^[A-Z]{3}$'),
 CONSTRAINT "purchase_receipt_lines_organization_id_fkey" FOREIGN KEY("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "purchase_receipt_lines_purchase_receipt_id_fkey" FOREIGN KEY("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "purchase_receipt_lines_purchase_item_id_fkey" FOREIGN KEY("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "purchase_receipt_lines_product_variant_id_fkey" FOREIGN KEY("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "purchase_receipt_lines_organization_id_purchase_receipt_id_idx" ON "purchase_receipt_lines"("organization_id","purchase_receipt_id");
CREATE INDEX "purchase_receipt_lines_organization_id_purchase_item_id_idx" ON "purchase_receipt_lines"("organization_id","purchase_item_id");

CREATE TABLE "bulk_acquisition_layers" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID NOT NULL, "purchase_receipt_line_id" UUID NOT NULL,
 "product_variant_id" UUID NOT NULL, "original_quantity" INTEGER NOT NULL, "unit_cost_minor" BIGINT NOT NULL,
 "total_cost_minor" BIGINT NOT NULL, "currency" CHAR(3) NOT NULL, "acquired_at" TIMESTAMPTZ(3) NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "bulk_acquisition_layers_pkey" PRIMARY KEY("id"), CONSTRAINT "bulk_acquisition_layers_purchase_receipt_line_id_key" UNIQUE("purchase_receipt_line_id"),
 CONSTRAINT "bulk_acquisition_layers_values_check" CHECK("original_quantity">0 AND "unit_cost_minor">=0 AND "total_cost_minor">=0),
 CONSTRAINT "bulk_acquisition_layers_currency_check" CHECK("currency" ~ '^[A-Z]{3}$'),
 CONSTRAINT "bulk_acquisition_layers_organization_id_fkey" FOREIGN KEY("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "bulk_acquisition_layers_purchase_receipt_line_id_fkey" FOREIGN KEY("purchase_receipt_line_id") REFERENCES "purchase_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "bulk_acquisition_layers_product_variant_id_fkey" FOREIGN KEY("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "bulk_acquisition_layers_organization_id_product_variant_id_acquired_at_idx" ON "bulk_acquisition_layers"("organization_id","product_variant_id","acquired_at");

ALTER TABLE "product_instances" ADD COLUMN "purchase_item_id" UUID, ADD COLUMN "purchase_receipt_line_id" UUID;
ALTER TABLE "purchases" ADD COLUMN "closed_at" TIMESTAMPTZ(3), ADD COLUMN "closed_by_user_id" UUID, ADD COLUMN "close_reason" VARCHAR(1000), ADD COLUMN "close_idempotency_key" VARCHAR(150);
CREATE UNIQUE INDEX "purchases_organization_id_close_idempotency_key_key" ON "purchases"("organization_id","close_idempotency_key");
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_closed_by_user_id_fkey" FOREIGN KEY("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_instances" ADD CONSTRAINT "product_instances_purchase_item_id_fkey" FOREIGN KEY("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_instances" ADD CONSTRAINT "product_instances_purchase_receipt_line_id_fkey" FOREIGN KEY("purchase_receipt_line_id") REFERENCES "purchase_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "product_instances_organization_id_purchase_receipt_line_id_idx" ON "product_instances"("organization_id","purchase_receipt_line_id");

CREATE OR REPLACE FUNCTION public.enforce_purchase_receipt_tenant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='purchase_receipts' THEN
  IF NOT EXISTS(SELECT 1 FROM purchases p WHERE p.id=NEW.purchase_id AND p.organization_id=NEW.organization_id AND p.destination_branch_id=NEW.branch_id)
   OR NOT EXISTS(SELECT 1 FROM locations l WHERE l.id=NEW.location_id AND l.organization_id=NEW.organization_id AND l.branch_id=NEW.branch_id) THEN RAISE EXCEPTION 'Purchase receipt tenant mismatch'; END IF;
 ELSIF TG_TABLE_NAME='purchase_receipt_lines' THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_receipts r JOIN purchase_items i ON i.id=NEW.purchase_item_id WHERE r.id=NEW.purchase_receipt_id AND r.organization_id=NEW.organization_id AND i.organization_id=NEW.organization_id AND i.purchase_id=r.purchase_id AND i.product_variant_id=NEW.product_variant_id) THEN RAISE EXCEPTION 'Purchase receipt line tenant mismatch'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM purchase_receipt_lines l WHERE l.id=NEW.purchase_receipt_line_id AND l.organization_id=NEW.organization_id AND l.product_variant_id=NEW.product_variant_id) THEN RAISE EXCEPTION 'Bulk acquisition layer tenant mismatch'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER purchase_receipts_tenant BEFORE INSERT OR UPDATE ON "purchase_receipts" FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_receipt_tenant();
CREATE TRIGGER purchase_receipt_lines_tenant BEFORE INSERT OR UPDATE ON "purchase_receipt_lines" FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_receipt_tenant();
CREATE TRIGGER bulk_acquisition_layers_tenant BEFORE INSERT OR UPDATE ON "bulk_acquisition_layers" FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_receipt_tenant();

CREATE OR REPLACE FUNCTION public.enforce_product_instance_purchase_provenance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.purchase_receipt_line_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM purchase_receipt_lines l WHERE l.id=NEW.purchase_receipt_line_id AND l.organization_id=NEW.organization_id AND l.product_variant_id=NEW.product_variant_id AND (NEW.purchase_item_id IS NULL OR l.purchase_item_id=NEW.purchase_item_id)
 ) THEN RAISE EXCEPTION 'Product instance purchase provenance mismatch'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER product_instances_purchase_provenance BEFORE INSERT OR UPDATE OF purchase_item_id,purchase_receipt_line_id ON "product_instances" FOR EACH ROW EXECUTE FUNCTION public.enforce_product_instance_purchase_provenance();

CREATE OR REPLACE FUNCTION public.prevent_purchase_receipt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'purchase receipt history is immutable'; END $$;
CREATE TRIGGER purchase_receipts_immutable BEFORE UPDATE OR DELETE ON "purchase_receipts" FOR EACH ROW EXECUTE FUNCTION public.prevent_purchase_receipt_mutation();
CREATE TRIGGER purchase_receipt_lines_immutable BEFORE UPDATE OR DELETE ON "purchase_receipt_lines" FOR EACH ROW EXECUTE FUNCTION public.prevent_purchase_receipt_mutation();
CREATE TRIGGER bulk_acquisition_layers_immutable BEFORE UPDATE OR DELETE ON "bulk_acquisition_layers" FOR EACH ROW EXECUTE FUNCTION public.prevent_purchase_receipt_mutation();

ALTER TABLE public."purchase_receipts" ENABLE ROW LEVEL SECURITY; ALTER TABLE public."purchase_receipt_lines" ENABLE ROW LEVEL SECURITY; ALTER TABLE public."bulk_acquisition_layers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."purchase_receipts",public."purchase_receipt_lines",public."bulk_acquisition_layers" FROM anon,authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_purchase_receipt_tenant() FROM PUBLIC,anon,authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_product_instance_purchase_provenance() FROM PUBLIC,anon,authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_purchase_receipt_mutation() FROM PUBLIC,anon,authenticated;
