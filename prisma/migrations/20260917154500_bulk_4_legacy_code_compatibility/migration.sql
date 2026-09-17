-- Keep legacy/manual code spelling valid while comparing scan codes canonically.
CREATE OR REPLACE FUNCTION public.enforce_scannable_code_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE raw_code TEXT;
DECLARE code TEXT;
BEGIN
  raw_code := CASE WHEN TG_TABLE_NAME='product_variants' THEN to_jsonb(NEW)->>'sku' ELSE to_jsonb(NEW)->>'barcode' END;
  code := upper(btrim(raw_code));
  IF code='' THEN RAISE EXCEPTION 'scannable code cannot be blank'; END IF;
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

REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_scannable_code_integrity() FROM PUBLIC, anon, authenticated;
