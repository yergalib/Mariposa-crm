CREATE OR REPLACE FUNCTION public.enforce_bulk_maintenance_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation_row "capacity_allocations"%ROWTYPE;
DECLARE related_row "capacity_allocations"%ROWTYPE;
DECLARE prior_quantity INTEGER;
BEGIN
  SELECT * INTO allocation_row FROM "capacity_allocations" a WHERE a."id"=NEW."capacity_allocation_id" FOR UPDATE;
  IF NOT FOUND OR allocation_row."organization_id"<>NEW."organization_id"
    OR allocation_row."branch_id"<>NEW."branch_id"
    OR allocation_row."product_variant_id"<>NEW."product_variant_id"
    OR allocation_row."source_type"<>'MAINTENANCE' OR allocation_row."product_instance_id" IS NOT NULL
    OR (allocation_row."bulk_source_resolution_line_id" IS NULL AND allocation_row."parent_maintenance_allocation_id" IS NULL) THEN
    RAISE EXCEPTION 'bulk maintenance event context mismatch';
  END IF;
  IF NEW."actor_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "organization_memberships" m
    WHERE m."organization_id"=NEW."organization_id" AND m."user_id"=NEW."actor_user_id" AND m."status"='ACTIVE'
  ) THEN RAISE EXCEPTION 'bulk maintenance event actor tenant mismatch'; END IF;
  IF NEW."type"<>'TRANSITIONED' AND NEW."related_allocation_id" IS NOT NULL THEN
    RAISE EXCEPTION 'related allocation is only valid for maintenance transition';
  END IF;
  IF NEW."related_allocation_id" IS NOT NULL THEN
    SELECT * INTO related_row FROM "capacity_allocations" a WHERE a."id"=NEW."related_allocation_id";
    IF NOT FOUND OR related_row."organization_id"<>NEW."organization_id"
      OR related_row."branch_id"<>NEW."branch_id"
      OR related_row."product_variant_id"<>NEW."product_variant_id"
      OR related_row."source_type"<>'MAINTENANCE' THEN
      RAISE EXCEPTION 'related maintenance allocation mismatch';
    END IF;
  END IF;
  IF NEW."type"='TRANSITIONED' AND (
    NEW."related_allocation_id" IS NULL
    OR related_row."parent_maintenance_allocation_id" IS DISTINCT FROM NEW."capacity_allocation_id"
    OR related_row."maintenance_kind"<>'REPAIR' OR allocation_row."maintenance_kind"<>'CLEANING'
    OR related_row."quantity"<>NEW."quantity"
  ) THEN RAISE EXCEPTION 'bulk maintenance transition event mismatch'; END IF;
  SELECT COALESCE(SUM(e."quantity"),0)::int INTO prior_quantity
  FROM "bulk_maintenance_events" e
  WHERE e."capacity_allocation_id"=NEW."capacity_allocation_id" AND e."id"<>NEW."id";
  IF prior_quantity+NEW."quantity">allocation_row."quantity" THEN
    RAISE EXCEPTION 'bulk maintenance event exceeds source quantity';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_maintenance_event() FROM PUBLIC, anon, authenticated;
