CREATE OR REPLACE FUNCTION public.enforce_catalog_execution_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE execution_product UUID; execution_org UUID; variant_product UUID; variant_org UUID; product_org UUID;
BEGIN
  IF TG_TABLE_NAME='product_executions' THEN
    SELECT "organization_id" INTO product_org FROM "products" WHERE "id"=NEW."product_id";
    IF product_org IS NULL OR product_org<>NEW."organization_id" THEN
      RAISE EXCEPTION 'execution must belong to the same organization as its product';
    END IF;
  ELSIF TG_TABLE_NAME='product_variants' AND NEW."execution_id" IS NOT NULL THEN
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

CREATE TRIGGER product_executions_tenant_integrity
BEFORE INSERT OR UPDATE OF "organization_id","product_id" ON "product_executions"
FOR EACH ROW EXECUTE FUNCTION public.enforce_catalog_execution_integrity();

REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_catalog_execution_integrity() FROM PUBLIC, anon, authenticated;
