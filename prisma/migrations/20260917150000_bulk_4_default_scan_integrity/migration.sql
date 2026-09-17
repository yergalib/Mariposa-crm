-- BULK-4: quantity tracking is the default for new products.
ALTER TABLE "products" ALTER COLUMN "tracking_mode" SET DEFAULT 'BULK';

-- A tracking model is a historical invariant after the first operational row.
CREATE OR REPLACE FUNCTION public.prevent_product_tracking_mode_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tracking_mode" IS NOT DISTINCT FROM OLD."tracking_mode" THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM "product_variants" v
    WHERE v."product_id"=OLD."id" AND v."organization_id"=OLD."organization_id"
      AND (
        EXISTS (SELECT 1 FROM "product_instances" x WHERE x."product_variant_id"=v."id")
        OR EXISTS (SELECT 1 FROM "stock_levels" x WHERE x."product_variant_id"=v."id")
        OR EXISTS (SELECT 1 FROM "inventory_movements" x WHERE x."product_variant_id"=v."id")
        OR EXISTS (SELECT 1 FROM "capacity_allocations" x WHERE x."product_variant_id"=v."id")
        OR EXISTS (SELECT 1 FROM "order_items" x WHERE x."product_variant_id"=v."id")
        OR EXISTS (SELECT 1 FROM "purchase_items" x WHERE x."product_variant_id"=v."id")
        OR EXISTS (SELECT 1 FROM "bulk_acquisition_layers" x WHERE x."product_variant_id"=v."id")
      )
  ) THEN RAISE EXCEPTION 'product tracking mode is immutable after operational history'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER products_tracking_mode_integrity
BEFORE UPDATE OF "tracking_mode" ON "products"
FOR EACH ROW EXECUTE FUNCTION public.prevent_product_tracking_mode_change();

-- A keyboard-wedge scan must never match both a variant and an instance.
CREATE OR REPLACE FUNCTION public.enforce_scannable_code_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE code TEXT;
BEGIN
  code := upper(btrim(CASE WHEN TG_TABLE_NAME='product_variants' THEN NEW."sku" ELSE NEW."barcode" END));
  IF code='' OR (CASE WHEN TG_TABLE_NAME='product_variants' THEN NEW."sku" ELSE NEW."barcode" END) IS DISTINCT FROM code THEN
    RAISE EXCEPTION 'scannable code must be normalized';
  END IF;
  IF TG_TABLE_NAME='product_variants' THEN
    IF EXISTS (SELECT 1 FROM "product_instances" i WHERE i."organization_id"=NEW."organization_id" AND upper(btrim(i."barcode"))=code) THEN
      RAISE EXCEPTION 'variant SKU conflicts with product instance barcode';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM "product_variants" v WHERE v."organization_id"=NEW."organization_id" AND upper(btrim(v."sku"))=code) THEN
      RAISE EXCEPTION 'product instance barcode conflicts with variant SKU';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER product_variants_scannable_code_integrity
BEFORE INSERT OR UPDATE OF "organization_id", "sku" ON "product_variants"
FOR EACH ROW EXECUTE FUNCTION public.enforce_scannable_code_integrity();

CREATE TRIGGER product_instances_scannable_code_integrity
BEFORE INSERT OR UPDATE OF "organization_id", "barcode" ON "product_instances"
FOR EACH ROW EXECUTE FUNCTION public.enforce_scannable_code_integrity();

REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_product_tracking_mode_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_scannable_code_integrity() FROM PUBLIC, anon, authenticated;
