CREATE TYPE "CatalogImportMode" AS ENUM ('OPENING_CATALOG');
CREATE TYPE "CatalogImportStatus" AS ENUM ('VALIDATED', 'APPLYING', 'APPLIED', 'FAILED');

CREATE TABLE "catalog_import_batches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "batch_key" VARCHAR(160) NOT NULL,
  "source_filename" VARCHAR(300) NOT NULL,
  "source_sha256" CHAR(64) NOT NULL,
  "plan_sha256" CHAR(64) NOT NULL,
  "mode" "CatalogImportMode" NOT NULL DEFAULT 'OPENING_CATALOG',
  "status" "CatalogImportStatus" NOT NULL DEFAULT 'VALIDATED',
  "branch_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "source_row_count" INTEGER NOT NULL,
  "product_count" INTEGER NOT NULL,
  "execution_count" INTEGER NOT NULL,
  "variant_count" INTEGER NOT NULL,
  "physical_unit_count" INTEGER NOT NULL,
  "preserved_sku_count" INTEGER NOT NULL,
  "generated_sku_count" INTEGER NOT NULL,
  "metadata" JSONB,
  "created_by_user_id" UUID,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "catalog_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_import_batches_counts_check" CHECK (
    "source_row_count">0 AND "product_count">0 AND "execution_count">=0 AND
    "variant_count">0 AND "physical_unit_count">0 AND
    "preserved_sku_count">=0 AND "generated_sku_count">=0 AND
    "preserved_sku_count"+"generated_sku_count"="variant_count"
  ),
  CONSTRAINT "catalog_import_batches_hashes_check" CHECK (
    "source_sha256" ~ '^[0-9A-F]{64}$' AND "plan_sha256" ~ '^[0-9A-F]{64}$'
  ),
  CONSTRAINT "catalog_import_batches_terminal_time_check" CHECK (
    ("status" IN ('APPLIED','FAILED')) = ("completed_at" IS NOT NULL)
  ),
  CONSTRAINT "catalog_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_import_batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_import_batches_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_import_batches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "catalog_import_batches_org_batch_key" ON "catalog_import_batches"("organization_id","batch_key");
CREATE UNIQUE INDEX "catalog_import_batches_org_source_mode_key" ON "catalog_import_batches"("organization_id","source_sha256","mode");
CREATE UNIQUE INDEX "catalog_import_batches_id_org_key" ON "catalog_import_batches"("id","organization_id");
CREATE INDEX "catalog_import_batches_org_status_created_idx" ON "catalog_import_batches"("organization_id","status","created_at");

CREATE TABLE "catalog_source_references" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "import_batch_id" UUID NOT NULL,
  "source_key" VARCHAR(100) NOT NULL,
  "source_row_index" INTEGER NOT NULL,
  "original_name" TEXT NOT NULL,
  "original_category" TEXT,
  "original_internal_code" TEXT,
  "original_sku" TEXT,
  "original_barcode" TEXT,
  "source_quantity" INTEGER NOT NULL,
  "target_quantity_contribution" INTEGER NOT NULL,
  "normalized_metadata" JSONB,
  "target_fingerprint" VARCHAR(200) NOT NULL,
  "product_id" UUID NOT NULL,
  "execution_id" UUID,
  "product_variant_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_source_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_source_references_quantity_check" CHECK ("source_quantity">0 AND "target_quantity_contribution">0),
  CONSTRAINT "catalog_source_references_row_check" CHECK ("source_row_index">0),
  CONSTRAINT "catalog_source_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_source_references_batch_org_fkey" FOREIGN KEY ("import_batch_id","organization_id") REFERENCES "catalog_import_batches"("id","organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_source_references_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_source_references_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "product_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_source_references_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "catalog_source_references_batch_source_key" ON "catalog_source_references"("import_batch_id","source_key");
CREATE INDEX "catalog_source_references_org_variant_idx" ON "catalog_source_references"("organization_id","product_variant_id");
CREATE INDEX "catalog_source_references_org_product_execution_idx" ON "catalog_source_references"("organization_id","product_id","execution_id");

CREATE FUNCTION public.enforce_catalog_import_provenance_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_org UUID; branch_org UUID; location_org UUID; location_branch UUID;
        product_org UUID; variant_org UUID; variant_product UUID; variant_execution UUID;
        execution_org UUID; execution_product UUID; batch_status "CatalogImportStatus";
BEGIN
  IF TG_TABLE_NAME='catalog_import_batches' THEN
    SELECT "organization_id" INTO branch_org FROM "branches" WHERE "id"=NEW."branch_id";
    SELECT "organization_id","branch_id" INTO location_org,location_branch FROM "locations" WHERE "id"=NEW."location_id";
    IF branch_org IS NULL OR branch_org<>NEW."organization_id" OR location_org IS NULL OR location_org<>NEW."organization_id" OR location_branch<>NEW."branch_id" THEN
      RAISE EXCEPTION 'catalog import branch/location must belong to organization';
    END IF;
    IF TG_OP='UPDATE' AND OLD."status" IN ('APPLIED','FAILED') THEN
      RAISE EXCEPTION 'terminal catalog import batch is immutable';
    END IF;
  ELSE
    SELECT "organization_id","status" INTO batch_org,batch_status FROM "catalog_import_batches" WHERE "id"=NEW."import_batch_id";
    SELECT "organization_id" INTO product_org FROM "products" WHERE "id"=NEW."product_id";
    SELECT "organization_id","product_id","execution_id" INTO variant_org,variant_product,variant_execution FROM "product_variants" WHERE "id"=NEW."product_variant_id";
    IF NEW."execution_id" IS NOT NULL THEN
      SELECT "organization_id","product_id" INTO execution_org,execution_product FROM "product_executions" WHERE "id"=NEW."execution_id";
    END IF;
    IF batch_org IS NULL OR batch_org<>NEW."organization_id" OR product_org<>NEW."organization_id" OR variant_org<>NEW."organization_id" OR variant_product<>NEW."product_id" OR variant_execution IS DISTINCT FROM NEW."execution_id" OR (NEW."execution_id" IS NOT NULL AND (execution_org<>NEW."organization_id" OR execution_product<>NEW."product_id")) THEN
      RAISE EXCEPTION 'catalog source reference tenant/target mismatch';
    END IF;
    IF batch_status='APPLIED' THEN RAISE EXCEPTION 'applied catalog provenance is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.prevent_catalog_import_provenance_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_status "CatalogImportStatus";
BEGIN
  IF TG_TABLE_NAME='catalog_import_batches' THEN
    IF OLD."status" IN ('APPLIED','FAILED') THEN RAISE EXCEPTION 'terminal catalog import batch is immutable'; END IF;
  ELSE
    SELECT "status" INTO batch_status FROM "catalog_import_batches" WHERE "id"=OLD."import_batch_id";
    IF batch_status='APPLIED' THEN RAISE EXCEPTION 'applied catalog provenance is immutable'; END IF;
  END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER catalog_import_batches_integrity BEFORE INSERT OR UPDATE ON "catalog_import_batches" FOR EACH ROW EXECUTE FUNCTION public.enforce_catalog_import_provenance_integrity();
CREATE TRIGGER catalog_import_batches_immutable_delete BEFORE DELETE ON "catalog_import_batches" FOR EACH ROW EXECUTE FUNCTION public.prevent_catalog_import_provenance_delete();
CREATE TRIGGER catalog_source_references_integrity BEFORE INSERT OR UPDATE ON "catalog_source_references" FOR EACH ROW EXECUTE FUNCTION public.enforce_catalog_import_provenance_integrity();
CREATE TRIGGER catalog_source_references_immutable_delete BEFORE DELETE ON "catalog_source_references" FOR EACH ROW EXECUTE FUNCTION public.prevent_catalog_import_provenance_delete();

ALTER TABLE "catalog_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_source_references" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "catalog_import_batches","catalog_source_references" FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_catalog_import_provenance_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_catalog_import_provenance_delete() FROM PUBLIC, anon, authenticated;
