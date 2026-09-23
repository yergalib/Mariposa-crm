ALTER TABLE "orders" ADD COLUMN "creation_idempotency_key" VARCHAR(150), ADD COLUMN "creation_payload_hash" CHAR(64);
CREATE UNIQUE INDEX "orders_organization_id_creation_idempotency_key_key" ON "orders"("organization_id","creation_idempotency_key");
ALTER TABLE "orders" ADD CONSTRAINT "orders_creation_idempotency_pair_check" CHECK (("creation_idempotency_key" IS NULL) = ("creation_payload_hash" IS NULL));

CREATE FUNCTION public.protect_confirmed_sale_commercial_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_type "OrderType";
DECLARE parent_status "OrderStatus";
BEGIN
  IF TG_TABLE_NAME='orders' THEN
    IF OLD."type"='SALE' AND OLD."status" IN ('CONFIRMED','COMPLETED','CANCELLED') AND (
      NEW."type" IS DISTINCT FROM OLD."type" OR NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
      NEW."customer_id" IS DISTINCT FROM OLD."customer_id" OR NEW."currency" IS DISTINCT FROM OLD."currency" OR
      NEW."subtotal_minor" IS DISTINCT FROM OLD."subtotal_minor" OR NEW."discount_total_minor" IS DISTINCT FROM OLD."discount_total_minor" OR
      NEW."total_minor" IS DISTINCT FROM OLD."total_minor" OR NEW."creation_idempotency_key" IS DISTINCT FROM OLD."creation_idempotency_key" OR
      NEW."creation_payload_hash" IS DISTINCT FROM OLD."creation_payload_hash"
    ) THEN RAISE EXCEPTION 'confirmed sale commercial state is immutable'; END IF;
    RETURN NEW;
  END IF;
  SELECT "type","status" INTO parent_type,parent_status FROM "orders" WHERE "id"=COALESCE(NEW."order_id",OLD."order_id");
  IF parent_type='SALE' AND parent_status IN ('CONFIRMED','COMPLETED','CANCELLED') THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'confirmed sale items are immutable'; END IF;
    IF TG_OP='INSERT' OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."order_id" IS DISTINCT FROM OLD."order_id" OR
      NEW."product_variant_id" IS DISTINCT FROM OLD."product_variant_id" OR NEW."quantity" IS DISTINCT FROM OLD."quantity" OR
      NEW."unit_price_minor" IS DISTINCT FROM OLD."unit_price_minor" OR NEW."discount_total_minor" IS DISTINCT FROM OLD."discount_total_minor" OR
      NEW."line_total_minor" IS DISTINCT FROM OLD."line_total_minor" OR NEW."currency" IS DISTINCT FROM OLD."currency" OR
      NEW."product_name_snapshot" IS DISTINCT FROM OLD."product_name_snapshot" OR NEW."variant_name_snapshot" IS DISTINCT FROM OLD."variant_name_snapshot" OR
      NEW."sku_snapshot" IS DISTINCT FROM OLD."sku_snapshot" OR NEW."adjustment_reason" IS DISTINCT FROM OLD."adjustment_reason" OR
      NEW."removed_at" IS DISTINCT FROM OLD."removed_at" THEN RAISE EXCEPTION 'confirmed sale item commercial state is immutable'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.check_completed_sale_fulfillment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_quantity INTEGER;
DECLARE fulfilled_quantity INTEGER;
DECLARE item_count INTEGER;
BEGIN
  IF NEW."type"<>'SALE' OR NEW."status"<>'COMPLETED' THEN RETURN NULL; END IF;
  SELECT count(*)::int,COALESCE(sum("quantity"),0)::int INTO item_count,item_quantity FROM "order_items" WHERE "order_id"=NEW."id" AND "removed_at" IS NULL;
  SELECT COALESCE(sum("quantity"),0)::int INTO fulfilled_quantity FROM "sale_inventory_commitments" WHERE "order_id"=NEW."id" AND "status"='FULFILLED';
  IF item_count=0 OR item_quantity<>fulfilled_quantity OR EXISTS (SELECT 1 FROM "sale_inventory_commitments" WHERE "order_id"=NEW."id" AND "status"<>'FULFILLED') THEN
    RAISE EXCEPTION 'completed sale requires complete physical fulfillment';
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER orders_confirmed_sale_commercial_guard BEFORE UPDATE ON "orders" FOR EACH ROW EXECUTE FUNCTION public.protect_confirmed_sale_commercial_state();
CREATE TRIGGER order_items_confirmed_sale_commercial_guard BEFORE INSERT OR UPDATE OR DELETE ON "order_items" FOR EACH ROW EXECUTE FUNCTION public.protect_confirmed_sale_commercial_state();
CREATE CONSTRAINT TRIGGER orders_completed_sale_fulfillment AFTER INSERT OR UPDATE ON "orders" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_completed_sale_fulfillment();

REVOKE ALL PRIVILEGES ON FUNCTION public.protect_confirmed_sale_commercial_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_completed_sale_fulfillment() FROM PUBLIC, anon, authenticated;
