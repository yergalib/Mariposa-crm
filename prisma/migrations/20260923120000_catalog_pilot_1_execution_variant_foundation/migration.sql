-- CATALOG PILOT-1: optional execution context while ProductVariant remains the inventory leaf.
CREATE TABLE "product_executions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "product_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_executions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_executions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "product_executions_organization_product_code_key" ON "product_executions"("organization_id", "product_id", "code");
CREATE UNIQUE INDEX "product_executions_id_organization_product_key" ON "product_executions"("id", "organization_id", "product_id");
CREATE INDEX "product_executions_organization_product_active_sort_idx" ON "product_executions"("organization_id", "product_id", "is_active", "sort_order");

ALTER TABLE "product_variants" ADD COLUMN "execution_id" UUID;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "product_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "product_variants_product_id_size_id_key";
CREATE UNIQUE INDEX "product_variants_product_size_without_execution_key" ON "product_variants"("product_id", "size_id") WHERE "execution_id" IS NULL;
CREATE UNIQUE INDEX "product_variants_product_execution_size_key" ON "product_variants"("product_id", "execution_id", "size_id") WHERE "execution_id" IS NOT NULL;
CREATE INDEX "product_variants_organization_execution_active_idx" ON "product_variants"("organization_id", "execution_id", "is_active");

ALTER TABLE "sizes" ADD COLUMN "recommended_height_cm" INTEGER, ADD COLUMN "length_cm" INTEGER;
UPDATE "sizes" SET "size_system"='LEGACY' WHERE "size_system" IS NULL OR btrim("size_system")='';
ALTER TABLE "sizes" ALTER COLUMN "size_system" SET DEFAULT 'LEGACY', ALTER COLUMN "size_system" SET NOT NULL;
DROP INDEX "sizes_organization_id_code_key";
CREATE UNIQUE INDEX "sizes_organization_system_code_key" ON "sizes"("organization_id", "size_system", "code");
ALTER TABLE "sizes" ADD CONSTRAINT "sizes_recommended_height_positive" CHECK ("recommended_height_cm" IS NULL OR "recommended_height_cm">0);
ALTER TABLE "sizes" ADD CONSTRAINT "sizes_length_positive" CHECK ("length_cm" IS NULL OR "length_cm">0);

ALTER TABLE "product_images" ADD COLUMN "execution_id" UUID;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "product_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_single_detail_scope_check" CHECK (NOT ("execution_id" IS NOT NULL AND "product_variant_id" IS NOT NULL));
CREATE INDEX "product_images_organization_execution_sort_idx" ON "product_images"("organization_id", "execution_id", "sort_order");
DROP INDEX "product_images_one_active_primary_per_product";
CREATE UNIQUE INDEX "product_images_one_active_primary_per_product" ON "product_images"("organization_id", "product_id") WHERE "is_primary"=true AND "status"='ACTIVE' AND "execution_id" IS NULL AND "product_variant_id" IS NULL;
CREATE UNIQUE INDEX "product_images_one_active_primary_per_execution" ON "product_images"("organization_id", "execution_id") WHERE "is_primary"=true AND "status"='ACTIVE' AND "execution_id" IS NOT NULL;
CREATE UNIQUE INDEX "product_images_one_active_primary_per_variant" ON "product_images"("organization_id", "product_variant_id") WHERE "is_primary"=true AND "status"='ACTIVE' AND "product_variant_id" IS NOT NULL;

CREATE FUNCTION public.enforce_catalog_execution_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE execution_product UUID; execution_org UUID; variant_product UUID; variant_org UUID;
BEGIN
  IF TG_TABLE_NAME='product_variants' AND NEW."execution_id" IS NOT NULL THEN
    SELECT "product_id","organization_id" INTO execution_product,execution_org FROM "product_executions" WHERE "id"=NEW."execution_id";
    IF execution_product IS NULL OR execution_product<>NEW."product_id" OR execution_org<>NEW."organization_id" THEN
      RAISE EXCEPTION 'variant execution must belong to the same product and organization';
    END IF;
  ELSIF TG_TABLE_NAME='product_images' THEN
    IF NEW."execution_id" IS NOT NULL THEN
      SELECT "product_id","organization_id" INTO execution_product,execution_org FROM "product_executions" WHERE "id"=NEW."execution_id";
      IF execution_product IS NULL OR execution_product<>NEW."product_id" OR execution_org<>NEW."organization_id" THEN
        RAISE EXCEPTION 'image execution must belong to the same product and organization';
      END IF;
    END IF;
    IF NEW."product_variant_id" IS NOT NULL THEN
      SELECT "product_id","organization_id" INTO variant_product,variant_org FROM "product_variants" WHERE "id"=NEW."product_variant_id";
      IF variant_product IS NULL OR variant_product<>NEW."product_id" OR variant_org<>NEW."organization_id" THEN
        RAISE EXCEPTION 'image variant must belong to the same product and organization';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER product_variants_execution_integrity BEFORE INSERT OR UPDATE OF "organization_id","product_id","execution_id" ON "product_variants" FOR EACH ROW EXECUTE FUNCTION public.enforce_catalog_execution_integrity();
CREATE TRIGGER product_images_execution_integrity BEFORE INSERT OR UPDATE OF "organization_id","product_id","execution_id","product_variant_id" ON "product_images" FOR EACH ROW EXECUTE FUNCTION public.enforce_catalog_execution_integrity();

ALTER TABLE "product_executions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "product_executions" FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_catalog_execution_integrity() FROM PUBLIC, anon, authenticated;
