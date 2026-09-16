CREATE OR REPLACE FUNCTION public.enforce_bulk_resolution_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation_row "capacity_allocations"%ROWTYPE;
DECLARE already_resolved INTEGER;
BEGIN
  SELECT * INTO allocation_row FROM "capacity_allocations" a WHERE a."id"=NEW."capacity_allocation_id" FOR UPDATE;
  IF NOT FOUND OR allocation_row."organization_id"<>NEW."organization_id"
    OR allocation_row."branch_id"<>NEW."branch_id"
    OR allocation_row."order_id" IS DISTINCT FROM NEW."order_id"
    OR allocation_row."order_item_id" IS DISTINCT FROM NEW."order_item_id"
    OR allocation_row."product_variant_id"<>NEW."product_variant_id"
    OR allocation_row."source_type"<>'ORDER' OR allocation_row."issued_quantity"<=0
    OR NOT EXISTS (
      SELECT 1 FROM "product_variants" v JOIN "products" p ON p."id"=v."product_id"
      WHERE v."id"=NEW."product_variant_id" AND v."organization_id"=NEW."organization_id" AND p."tracking_mode"='BULK'
    ) THEN RAISE EXCEPTION 'bulk physical resolution context mismatch';
  END IF;
  IF NEW."location_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "locations" l WHERE l."id"=NEW."location_id" AND l."organization_id"=NEW."organization_id" AND l."branch_id"=NEW."branch_id"
  ) THEN RAISE EXCEPTION 'bulk physical resolution location mismatch'; END IF;
  IF NEW."actor_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "organization_memberships" m WHERE m."organization_id"=NEW."organization_id" AND m."user_id"=NEW."actor_user_id"
  ) THEN RAISE EXCEPTION 'bulk physical resolution actor tenant mismatch'; END IF;
  SELECT COALESCE(SUM(r."total_quantity"),0)::int INTO already_resolved
  FROM "bulk_physical_resolutions" r
  WHERE r."capacity_allocation_id"=NEW."capacity_allocation_id" AND r."id"<>NEW."id";
  IF already_resolved + NEW."total_quantity" > allocation_row."issued_quantity" THEN
    RAISE EXCEPTION 'bulk physical resolution exceeds issued quantity';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_bulk_maintenance_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation_row "capacity_allocations"%ROWTYPE;
DECLARE related_row "capacity_allocations"%ROWTYPE;
DECLARE prior_quantity INTEGER;
BEGIN
  SELECT * INTO allocation_row FROM "capacity_allocations" a WHERE a."id"=NEW."capacity_allocation_id" FOR UPDATE;
  IF NOT FOUND OR allocation_row."organization_id"<>NEW."organization_id" OR allocation_row."branch_id"<>NEW."branch_id"
    OR allocation_row."product_variant_id"<>NEW."product_variant_id" OR allocation_row."source_type"<>'MAINTENANCE'
    OR allocation_row."product_instance_id" IS NOT NULL OR allocation_row."bulk_source_resolution_line_id" IS NULL THEN
    RAISE EXCEPTION 'bulk maintenance event context mismatch';
  END IF;
  IF NEW."actor_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "organization_memberships" m WHERE m."organization_id"=NEW."organization_id" AND m."user_id"=NEW."actor_user_id"
  ) THEN RAISE EXCEPTION 'bulk maintenance event actor tenant mismatch'; END IF;
  IF NEW."related_allocation_id" IS NOT NULL THEN
    SELECT * INTO related_row FROM "capacity_allocations" a WHERE a."id"=NEW."related_allocation_id";
    IF NOT FOUND OR related_row."organization_id"<>NEW."organization_id" OR related_row."product_variant_id"<>NEW."product_variant_id" OR related_row."source_type"<>'MAINTENANCE' THEN
      RAISE EXCEPTION 'related maintenance allocation mismatch';
    END IF;
  END IF;
  SELECT COALESCE(SUM(e."quantity"),0)::int INTO prior_quantity FROM "bulk_maintenance_events" e
  WHERE e."capacity_allocation_id"=NEW."capacity_allocation_id" AND e."id"<>NEW."id";
  IF prior_quantity+NEW."quantity">allocation_row."quantity" THEN RAISE EXCEPTION 'bulk maintenance event exceeds source quantity'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.check_bulk_maintenance_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_allocation_id UUID;
DECLARE allocation_row "capacity_allocations"%ROWTYPE;
DECLARE terminal_quantity INTEGER;
BEGIN
  IF TG_TABLE_NAME='capacity_allocations' THEN
    IF TG_OP='DELETE' THEN target_allocation_id := OLD."id"; ELSE target_allocation_id := NEW."id"; END IF;
  ELSE
    IF TG_OP='DELETE' THEN target_allocation_id := OLD."capacity_allocation_id"; ELSE target_allocation_id := NEW."capacity_allocation_id"; END IF;
  END IF;
  SELECT * INTO allocation_row FROM "capacity_allocations" a WHERE a."id"=target_allocation_id;
  IF NOT FOUND OR allocation_row."source_type"<>'MAINTENANCE' OR allocation_row."bulk_source_resolution_line_id" IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(e."quantity"),0)::int INTO terminal_quantity FROM "bulk_maintenance_events" e WHERE e."capacity_allocation_id"=target_allocation_id;
  IF terminal_quantity>allocation_row."quantity" THEN RAISE EXCEPTION 'bulk maintenance projection exceeds source quantity'; END IF;
  IF allocation_row."status"='ACTIVE' THEN
    IF allocation_row."released_at" IS NOT NULL THEN RAISE EXCEPTION 'active bulk maintenance cannot be released'; END IF;
    IF terminal_quantity=allocation_row."quantity" THEN RAISE EXCEPTION 'completed bulk maintenance must be released'; END IF;
  ELSE
    IF allocation_row."released_at" IS NULL OR terminal_quantity<>allocation_row."quantity" THEN
      RAISE EXCEPTION 'released bulk maintenance requires full immutable resolution';
    END IF;
  END IF;
  RETURN NULL;
END; $$;

CREATE CONSTRAINT TRIGGER capacity_allocations_bulk_maintenance_projection
AFTER INSERT OR UPDATE OF status,released_at,quantity ON "capacity_allocations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bulk_maintenance_projection();
CREATE CONSTRAINT TRIGGER bulk_maintenance_events_projection
AFTER INSERT OR UPDATE OR DELETE ON "bulk_maintenance_events"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bulk_maintenance_projection();

REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_resolution_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_maintenance_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_maintenance_projection() FROM PUBLIC, anon, authenticated;
