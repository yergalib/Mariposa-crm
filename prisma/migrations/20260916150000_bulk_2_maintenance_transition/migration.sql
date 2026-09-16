ALTER TABLE "capacity_allocations"
  ADD COLUMN "parent_maintenance_allocation_id" UUID;

CREATE INDEX "capacity_allocations_bulk_maintenance_parent_idx"
  ON "capacity_allocations"("organization_id", "parent_maintenance_allocation_id");

ALTER TABLE "capacity_allocations"
  ADD CONSTRAINT "capacity_allocations_parent_maintenance_allocation_id_fkey"
  FOREIGN KEY ("parent_maintenance_allocation_id") REFERENCES "capacity_allocations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.enforce_bulk_maintenance_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_line "bulk_physical_resolution_lines"%ROWTYPE;
DECLARE source_resolution "bulk_physical_resolutions"%ROWTYPE;
DECLARE parent_row "capacity_allocations"%ROWTYPE;
DECLARE mode "InventoryTrackingMode";
BEGIN
  SELECT p."tracking_mode" INTO mode
  FROM "product_variants" v JOIN "products" p ON p."id"=v."product_id"
  WHERE v."id"=NEW."product_variant_id";

  IF NEW."source_type"<>'MAINTENANCE' THEN
    IF NEW."maintenance_kind" IS NOT NULL OR NEW."maintenance_location_id" IS NOT NULL
      OR NEW."bulk_source_resolution_line_id" IS NOT NULL OR NEW."parent_maintenance_allocation_id" IS NOT NULL THEN
      RAISE EXCEPTION 'maintenance fields require maintenance allocation';
    END IF;
    RETURN NEW;
  END IF;

  IF mode='BULK' THEN
    IF NEW."product_instance_id" IS NOT NULL OR NEW."maintenance_kind" IS NULL OR NEW."maintenance_location_id" IS NULL
      OR ((NEW."bulk_source_resolution_line_id" IS NULL) = (NEW."parent_maintenance_allocation_id" IS NULL)) THEN
      RAISE EXCEPTION 'bulk maintenance context is incomplete';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM "locations" l
      WHERE l."id"=NEW."maintenance_location_id" AND l."organization_id"=NEW."organization_id"
        AND l."branch_id"=NEW."branch_id"
        AND ((NEW."maintenance_kind"='CLEANING' AND l."type"='CLEANING')
          OR (NEW."maintenance_kind"='REPAIR' AND l."type"='REPAIR'))
    ) THEN RAISE EXCEPTION 'bulk maintenance location mismatch'; END IF;

    IF NEW."bulk_source_resolution_line_id" IS NOT NULL THEN
      SELECT * INTO source_line FROM "bulk_physical_resolution_lines" l
      WHERE l."id"=NEW."bulk_source_resolution_line_id" FOR UPDATE;
      SELECT * INTO source_resolution FROM "bulk_physical_resolutions" r WHERE r."id"=source_line."resolution_id";
      IF NOT FOUND OR source_line."organization_id"<>NEW."organization_id"
        OR source_line."product_variant_id"<>NEW."product_variant_id"
        OR source_resolution."branch_id"<>NEW."branch_id" OR source_resolution."kind"<>'RETURN'
        OR NEW."quantity">source_line."quantity"
        OR (source_resolution."capacity_allocation_id" IS NOT NULL
          AND NEW."blocked_from" < COALESCE((SELECT a."blocked_until" FROM "capacity_allocations" a WHERE a."id"=source_resolution."capacity_allocation_id"), NEW."blocked_from"))
        OR (NEW."maintenance_kind"='CLEANING' AND source_line."outcome"<>'NEEDS_CLEANING')
        OR (NEW."maintenance_kind"='REPAIR' AND source_line."outcome"<>'DAMAGED')
      THEN RAISE EXCEPTION 'bulk maintenance source mismatch'; END IF;
    ELSE
      SELECT * INTO parent_row FROM "capacity_allocations" a
      WHERE a."id"=NEW."parent_maintenance_allocation_id" FOR UPDATE;
      IF NOT FOUND OR parent_row."organization_id"<>NEW."organization_id"
        OR parent_row."branch_id"<>NEW."branch_id"
        OR parent_row."product_variant_id"<>NEW."product_variant_id"
        OR parent_row."source_type"<>'MAINTENANCE' OR parent_row."product_instance_id" IS NOT NULL
        OR parent_row."maintenance_kind"<>'CLEANING' OR NEW."maintenance_kind"<>'REPAIR'
        OR parent_row."status"<>'ACTIVE' OR NEW."quantity">parent_row."quantity"
        OR NEW."blocked_from"<parent_row."blocked_from"
      THEN RAISE EXCEPTION 'bulk maintenance transition source mismatch'; END IF;
    END IF;
  ELSIF NEW."bulk_source_resolution_line_id" IS NOT NULL OR NEW."parent_maintenance_allocation_id" IS NOT NULL THEN
    RAISE EXCEPTION 'serialized maintenance cannot use bulk source';
  END IF;
  RETURN NEW;
END; $$;

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
  IF NOT FOUND OR allocation_row."source_type"<>'MAINTENANCE'
    OR (allocation_row."bulk_source_resolution_line_id" IS NULL AND allocation_row."parent_maintenance_allocation_id" IS NULL)
  THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(e."quantity"),0)::int INTO terminal_quantity
  FROM "bulk_maintenance_events" e WHERE e."capacity_allocation_id"=target_allocation_id;
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

DROP TRIGGER capacity_allocations_bulk_maintenance ON "capacity_allocations";
CREATE TRIGGER capacity_allocations_bulk_maintenance
BEFORE INSERT OR UPDATE OF source_type,product_variant_id,product_instance_id,branch_id,quantity,
  maintenance_kind,maintenance_location_id,bulk_source_resolution_line_id,parent_maintenance_allocation_id
ON "capacity_allocations" FOR EACH ROW EXECUTE FUNCTION public.enforce_bulk_maintenance_allocation();

REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_maintenance_allocation() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_maintenance_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_maintenance_projection() FROM PUBLIC, anon, authenticated;
