CREATE OR REPLACE FUNCTION public.enforce_sale_commitment_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_row "orders"%ROWTYPE;
DECLARE item_row "order_items"%ROWTYPE;
DECLARE tracking "InventoryTrackingMode";
DECLARE instance_row "product_instances"%ROWTYPE;
DECLARE committed_quantity INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('capacity:'||NEW."organization_id"::text||':'||NEW."branch_id"::text||':'||NEW."product_variant_id"::text,0));
  IF NEW."status" <> 'ACTIVE' OR NEW."terminal_at" IS NOT NULL OR NEW."terminal_by_user_id" IS NOT NULL OR NEW."terminal_reason" IS NOT NULL THEN
    RAISE EXCEPTION 'sale commitment must be created active';
  END IF;
  SELECT * INTO order_row FROM "orders" WHERE "id"=NEW."order_id";
  SELECT * INTO item_row FROM "order_items" WHERE "id"=NEW."order_item_id";
  SELECT p."tracking_mode" INTO tracking FROM "product_variants" v JOIN "products" p ON p."id"=v."product_id" WHERE v."id"=NEW."product_variant_id" AND v."organization_id"=NEW."organization_id";
  IF order_row."id" IS NULL OR order_row."organization_id"<>NEW."organization_id" OR order_row."type"<>'SALE' OR order_row."branch_id"<>NEW."branch_id" THEN RAISE EXCEPTION 'sale commitment order context mismatch'; END IF;
  IF item_row."id" IS NULL OR item_row."organization_id"<>NEW."organization_id" OR item_row."order_id"<>NEW."order_id" OR item_row."product_variant_id"<>NEW."product_variant_id" OR item_row."removed_at" IS NOT NULL THEN RAISE EXCEPTION 'sale commitment item context mismatch'; END IF;
  SELECT COALESCE(SUM("quantity"),0)::int INTO committed_quantity FROM "sale_inventory_commitments" WHERE "order_item_id"=NEW."order_item_id" AND "status"<>'CANCELLED';
  IF committed_quantity + NEW."quantity" > item_row."quantity" THEN RAISE EXCEPTION 'sale commitment quantity exceeds order item quantity'; END IF;
  IF tracking IS NULL THEN RAISE EXCEPTION 'sale commitment variant context mismatch'; END IF;
  IF tracking='BULK' AND NEW."product_instance_id" IS NOT NULL THEN RAISE EXCEPTION 'BULK sale commitment cannot identify an instance'; END IF;
  IF tracking='SERIALIZED' THEN
    IF NEW."product_instance_id" IS NULL OR NEW."quantity"<>1 THEN RAISE EXCEPTION 'SERIALIZED sale commitment requires one instance'; END IF;
    SELECT * INTO instance_row FROM "product_instances" WHERE "id"=NEW."product_instance_id";
    IF instance_row."id" IS NULL OR instance_row."organization_id"<>NEW."organization_id" OR instance_row."product_variant_id"<>NEW."product_variant_id" OR instance_row."current_branch_id"<>NEW."branch_id" OR instance_row."operational_status"<>'AVAILABLE' OR instance_row."retired_at" IS NOT NULL THEN RAISE EXCEPTION 'sale commitment instance context mismatch'; END IF;
    IF EXISTS (
      SELECT 1 FROM "capacity_allocations" a
      WHERE a."product_instance_id"=NEW."product_instance_id" AND a."status"='ACTIVE'
        AND (a."blocked_until" IS NULL OR a."blocked_until">NEW."confirmed_at")
    ) THEN RAISE EXCEPTION 'sale commitment instance has a conflicting allocation'; END IF;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_sale_commitment_integrity() FROM PUBLIC, anon, authenticated;
