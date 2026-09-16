CREATE OR REPLACE FUNCTION public.check_bulk_allocation_return_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tracking_mode "InventoryTrackingMode";
DECLARE returned_total INTEGER;
DECLARE current_returned INTEGER;
BEGIN
  SELECT p."tracking_mode" INTO tracking_mode
  FROM "product_variants" v JOIN "products" p ON p."id"=v."product_id"
  WHERE v."id"=NEW."product_variant_id";
  IF tracking_mode='BULK' AND NEW."source_type"='ORDER' AND NEW."issued_quantity">0 THEN
    SELECT a."returned_quantity" INTO current_returned FROM "capacity_allocations" a WHERE a."id"=NEW."id";
    SELECT COALESCE(SUM(r."total_quantity"),0)::int INTO returned_total
    FROM "bulk_physical_resolutions" r
    WHERE r."capacity_allocation_id"=NEW."id" AND r."kind"='RETURN';
    IF current_returned<>returned_total THEN RAISE EXCEPTION 'bulk returned quantity projection mismatch'; END IF;
  END IF;
  RETURN NULL;
END; $$;

REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_allocation_return_projection() FROM PUBLIC, anon, authenticated;
