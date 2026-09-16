CREATE TYPE "BulkPhysicalResolutionKind" AS ENUM ('RETURN', 'LOSS_RESOLUTION');
CREATE TYPE "BulkPhysicalResolutionOutcome" AS ENUM ('GOOD', 'NEEDS_CLEANING', 'DAMAGED', 'LEGACY_UNKNOWN', 'LOST');
CREATE TYPE "BulkPhysicalResolutionProvenance" AS ENUM ('RECORDED', 'LEGACY_BASELINE');
CREATE TYPE "BulkMaintenanceKind" AS ENUM ('CLEANING', 'REPAIR');
CREATE TYPE "BulkMaintenanceEventType" AS ENUM ('COMPLETED', 'TRANSITIONED', 'WRITTEN_OFF', 'TRANSFERRED');

ALTER TABLE "capacity_allocations"
  ADD COLUMN "maintenance_kind" "BulkMaintenanceKind",
  ADD COLUMN "maintenance_location_id" UUID,
  ADD COLUMN "bulk_source_resolution_line_id" UUID;

ALTER TABLE "inventory_movements"
  ADD COLUMN "bulk_resolution_line_id" UUID,
  ADD COLUMN "bulk_maintenance_event_id" UUID;

CREATE TABLE "bulk_physical_resolutions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "location_id" UUID,
  "order_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "capacity_allocation_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "kind" "BulkPhysicalResolutionKind" NOT NULL,
  "provenance" "BulkPhysicalResolutionProvenance" NOT NULL DEFAULT 'RECORDED',
  "total_quantity" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(150) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "actor_user_id" UUID,
  "note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bulk_physical_resolutions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bulk_physical_resolutions_quantity_positive" CHECK ("total_quantity" > 0)
);

CREATE TABLE "bulk_physical_resolution_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "resolution_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "outcome" "BulkPhysicalResolutionOutcome" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bulk_physical_resolution_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bulk_physical_resolution_lines_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "bulk_maintenance_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "capacity_allocation_id" UUID NOT NULL,
  "related_allocation_id" UUID,
  "product_variant_id" UUID NOT NULL,
  "type" "BulkMaintenanceEventType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(150) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "actor_user_id" UUID,
  "note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bulk_maintenance_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bulk_maintenance_events_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "bulk_maintenance_events_related_state" CHECK (
    ("type" IN ('TRANSITIONED','TRANSFERRED') AND "related_allocation_id" IS NOT NULL)
    OR ("type" IN ('COMPLETED','WRITTEN_OFF') AND "related_allocation_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "bulk_physical_resolutions_organization_id_idempotency_key_key" ON "bulk_physical_resolutions"("organization_id", "idempotency_key");
CREATE INDEX "bulk_physical_resolutions_organization_id_capacity_allocation_id_occurred_at_idx" ON "bulk_physical_resolutions"("organization_id", "capacity_allocation_id", "occurred_at");
CREATE INDEX "bulk_physical_resolutions_organization_id_order_id_occurred_at_idx" ON "bulk_physical_resolutions"("organization_id", "order_id", "occurred_at");
CREATE INDEX "bulk_physical_resolutions_organization_id_product_variant_id_branch_id_occurred_at_idx" ON "bulk_physical_resolutions"("organization_id", "product_variant_id", "branch_id", "occurred_at");
CREATE INDEX "bulk_physical_resolution_lines_organization_id_resolution_id_idx" ON "bulk_physical_resolution_lines"("organization_id", "resolution_id");
CREATE INDEX "bulk_physical_resolution_lines_organization_id_product_variant_id_created_at_idx" ON "bulk_physical_resolution_lines"("organization_id", "product_variant_id", "created_at");
CREATE UNIQUE INDEX "bulk_maintenance_events_organization_id_idempotency_key_key" ON "bulk_maintenance_events"("organization_id", "idempotency_key");
CREATE INDEX "bulk_maintenance_events_organization_id_capacity_allocation_id_occurred_at_idx" ON "bulk_maintenance_events"("organization_id", "capacity_allocation_id", "occurred_at");
CREATE INDEX "bulk_maintenance_events_organization_id_product_variant_id_branch_id_occurred_at_idx" ON "bulk_maintenance_events"("organization_id", "product_variant_id", "branch_id", "occurred_at");
CREATE UNIQUE INDEX "capacity_allocations_bulk_source_resolution_line_id_key" ON "capacity_allocations"("bulk_source_resolution_line_id");
CREATE INDEX "inventory_movements_organization_id_bulk_resolution_line_id_idx" ON "inventory_movements"("organization_id", "bulk_resolution_line_id");
CREATE INDEX "inventory_movements_organization_id_bulk_maintenance_event_id_idx" ON "inventory_movements"("organization_id", "bulk_maintenance_event_id");

ALTER TABLE "bulk_physical_resolutions" ADD CONSTRAINT "bulk_physical_resolutions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolutions" ADD CONSTRAINT "bulk_physical_resolutions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolutions" ADD CONSTRAINT "bulk_physical_resolutions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolutions" ADD CONSTRAINT "bulk_physical_resolutions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolutions" ADD CONSTRAINT "bulk_physical_resolutions_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolutions" ADD CONSTRAINT "bulk_physical_resolutions_capacity_allocation_id_fkey" FOREIGN KEY ("capacity_allocation_id") REFERENCES "capacity_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolutions" ADD CONSTRAINT "bulk_physical_resolutions_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolutions" ADD CONSTRAINT "bulk_physical_resolutions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolution_lines" ADD CONSTRAINT "bulk_physical_resolution_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolution_lines" ADD CONSTRAINT "bulk_physical_resolution_lines_resolution_id_fkey" FOREIGN KEY ("resolution_id") REFERENCES "bulk_physical_resolutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_physical_resolution_lines" ADD CONSTRAINT "bulk_physical_resolution_lines_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_maintenance_events" ADD CONSTRAINT "bulk_maintenance_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_maintenance_events" ADD CONSTRAINT "bulk_maintenance_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_maintenance_events" ADD CONSTRAINT "bulk_maintenance_events_capacity_allocation_id_fkey" FOREIGN KEY ("capacity_allocation_id") REFERENCES "capacity_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_maintenance_events" ADD CONSTRAINT "bulk_maintenance_events_related_allocation_id_fkey" FOREIGN KEY ("related_allocation_id") REFERENCES "capacity_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_maintenance_events" ADD CONSTRAINT "bulk_maintenance_events_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bulk_maintenance_events" ADD CONSTRAINT "bulk_maintenance_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "capacity_allocations" ADD CONSTRAINT "capacity_allocations_maintenance_location_id_fkey" FOREIGN KEY ("maintenance_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "capacity_allocations" ADD CONSTRAINT "capacity_allocations_bulk_source_resolution_line_id_fkey" FOREIGN KEY ("bulk_source_resolution_line_id") REFERENCES "bulk_physical_resolution_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_bulk_resolution_line_id_fkey" FOREIGN KEY ("bulk_resolution_line_id") REFERENCES "bulk_physical_resolution_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_bulk_maintenance_event_id_fkey" FOREIGN KEY ("bulk_maintenance_event_id") REFERENCES "bulk_maintenance_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the only fact known about prior BULK returns: their quantity. The
-- migration deliberately records no fabricated inspection result.
INSERT INTO "bulk_physical_resolutions" (
  "organization_id", "branch_id", "order_id", "order_item_id", "capacity_allocation_id",
  "product_variant_id", "kind", "provenance", "total_quantity", "idempotency_key",
  "occurred_at", "actor_user_id", "note"
)
SELECT a."organization_id", a."branch_id", a."order_id", a."order_item_id", a."id",
       a."product_variant_id", 'RETURN', 'LEGACY_BASELINE', a."returned_quantity",
       'bulk-legacy-return:' || a."id"::text,
       COALESCE(a."returned_at", a."updated_at"), a."returned_by_user_id",
       'Imported quantity only; historical return disposition is unknown.'
FROM "capacity_allocations" a
JOIN "product_variants" v ON v."id"=a."product_variant_id" AND v."organization_id"=a."organization_id"
JOIN "products" p ON p."id"=v."product_id" AND p."organization_id"=a."organization_id"
WHERE p."tracking_mode"='BULK' AND a."source_type"='ORDER' AND a."returned_quantity">0
  AND a."order_id" IS NOT NULL AND a."order_item_id" IS NOT NULL;

INSERT INTO "bulk_physical_resolution_lines" (
  "organization_id", "resolution_id", "product_variant_id", "outcome", "quantity", "note"
)
SELECT r."organization_id", r."id", r."product_variant_id", 'LEGACY_UNKNOWN', r."total_quantity",
       'Historical quantity retained without an invented disposition.'
FROM "bulk_physical_resolutions" r WHERE r."provenance"='LEGACY_BASELINE';

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
    SELECT 1 FROM "users" u WHERE u."id"=NEW."actor_user_id"
  ) THEN RAISE EXCEPTION 'bulk physical resolution actor mismatch'; END IF;
  SELECT COALESCE(SUM(r."total_quantity"),0)::int INTO already_resolved
  FROM "bulk_physical_resolutions" r
  WHERE r."capacity_allocation_id"=NEW."capacity_allocation_id" AND r."id"<>NEW."id";
  IF already_resolved + NEW."total_quantity" > allocation_row."issued_quantity" THEN
    RAISE EXCEPTION 'bulk physical resolution exceeds issued quantity';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_bulk_resolution_line_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolution_row "bulk_physical_resolutions"%ROWTYPE;
BEGIN
  SELECT * INTO resolution_row FROM "bulk_physical_resolutions" r WHERE r."id"=NEW."resolution_id";
  IF NOT FOUND OR resolution_row."organization_id"<>NEW."organization_id" OR resolution_row."product_variant_id"<>NEW."product_variant_id" THEN
    RAISE EXCEPTION 'bulk physical resolution line context mismatch';
  END IF;
  IF resolution_row."kind"='RETURN' AND NEW."outcome" NOT IN ('GOOD','NEEDS_CLEANING','DAMAGED','LEGACY_UNKNOWN') THEN
    RAISE EXCEPTION 'invalid bulk return outcome';
  ELSIF resolution_row."kind"='LOSS_RESOLUTION' AND NEW."outcome"<>'LOST' THEN
    RAISE EXCEPTION 'invalid bulk loss outcome';
  END IF;
  IF resolution_row."provenance"='LEGACY_BASELINE' AND NEW."outcome"<>'LEGACY_UNKNOWN' THEN
    RAISE EXCEPTION 'legacy return disposition must remain unknown';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.check_bulk_resolution_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolution_id UUID;
DECLARE resolution_row "bulk_physical_resolutions"%ROWTYPE;
DECLARE line_total INTEGER;
DECLARE returned_total INTEGER;
DECLARE lost_total INTEGER;
DECLARE projected_returned INTEGER;
BEGIN
  resolution_id := CASE WHEN TG_TABLE_NAME='bulk_physical_resolutions' THEN COALESCE(NEW."id",OLD."id") ELSE COALESCE(NEW."resolution_id",OLD."resolution_id") END;
  SELECT * INTO resolution_row FROM "bulk_physical_resolutions" r WHERE r."id"=resolution_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(l."quantity"),0)::int INTO line_total FROM "bulk_physical_resolution_lines" l WHERE l."resolution_id"=resolution_id;
  IF line_total<>resolution_row."total_quantity" THEN RAISE EXCEPTION 'bulk physical resolution line total mismatch'; END IF;
  SELECT
    COALESCE(SUM(r."total_quantity") FILTER (WHERE r."kind"='RETURN'),0)::int,
    COALESCE(SUM(r."total_quantity") FILTER (WHERE r."kind"='LOSS_RESOLUTION'),0)::int
  INTO returned_total,lost_total FROM "bulk_physical_resolutions" r WHERE r."capacity_allocation_id"=resolution_row."capacity_allocation_id";
  SELECT a."returned_quantity" INTO projected_returned FROM "capacity_allocations" a WHERE a."id"=resolution_row."capacity_allocation_id";
  IF projected_returned<>returned_total THEN RAISE EXCEPTION 'bulk returned quantity projection mismatch'; END IF;
  IF returned_total+lost_total>(SELECT a."issued_quantity" FROM "capacity_allocations" a WHERE a."id"=resolution_row."capacity_allocation_id") THEN
    RAISE EXCEPTION 'bulk physical resolution exceeds issued quantity';
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.check_bulk_allocation_return_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tracking_mode "InventoryTrackingMode";
DECLARE returned_total INTEGER;
BEGIN
  SELECT p."tracking_mode" INTO tracking_mode FROM "product_variants" v JOIN "products" p ON p."id"=v."product_id" WHERE v."id"=NEW."product_variant_id";
  IF tracking_mode='BULK' AND NEW."source_type"='ORDER' AND NEW."issued_quantity">0 THEN
    SELECT COALESCE(SUM(r."total_quantity"),0)::int INTO returned_total FROM "bulk_physical_resolutions" r WHERE r."capacity_allocation_id"=NEW."id" AND r."kind"='RETURN';
    IF NEW."returned_quantity"<>returned_total THEN RAISE EXCEPTION 'bulk returned quantity projection mismatch'; END IF;
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_bulk_maintenance_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_line "bulk_physical_resolution_lines"%ROWTYPE;
DECLARE source_resolution "bulk_physical_resolutions"%ROWTYPE;
DECLARE mode "InventoryTrackingMode";
BEGIN
  SELECT p."tracking_mode" INTO mode FROM "product_variants" v JOIN "products" p ON p."id"=v."product_id" WHERE v."id"=NEW."product_variant_id";
  IF NEW."source_type"<>'MAINTENANCE' THEN
    IF NEW."maintenance_kind" IS NOT NULL OR NEW."maintenance_location_id" IS NOT NULL OR NEW."bulk_source_resolution_line_id" IS NOT NULL THEN
      RAISE EXCEPTION 'maintenance fields require maintenance allocation';
    END IF;
    RETURN NEW;
  END IF;
  IF mode='BULK' THEN
    IF NEW."product_instance_id" IS NOT NULL OR NEW."maintenance_kind" IS NULL OR NEW."maintenance_location_id" IS NULL OR NEW."bulk_source_resolution_line_id" IS NULL THEN
      RAISE EXCEPTION 'bulk maintenance context is incomplete';
    END IF;
    SELECT * INTO source_line FROM "bulk_physical_resolution_lines" l WHERE l."id"=NEW."bulk_source_resolution_line_id" FOR UPDATE;
    SELECT * INTO source_resolution FROM "bulk_physical_resolutions" r WHERE r."id"=source_line."resolution_id";
    IF NOT FOUND OR source_line."organization_id"<>NEW."organization_id" OR source_line."product_variant_id"<>NEW."product_variant_id"
      OR source_resolution."branch_id"<>NEW."branch_id" OR source_resolution."kind"<>'RETURN'
      OR NEW."quantity">source_line."quantity"
      OR (source_resolution."capacity_allocation_id" IS NOT NULL AND NEW."blocked_from" < COALESCE((SELECT a."blocked_until" FROM "capacity_allocations" a WHERE a."id"=source_resolution."capacity_allocation_id"), NEW."blocked_from"))
      OR (NEW."maintenance_kind"='CLEANING' AND source_line."outcome"<>'NEEDS_CLEANING')
      OR (NEW."maintenance_kind"='REPAIR' AND source_line."outcome"<>'DAMAGED')
      OR NOT EXISTS (SELECT 1 FROM "locations" l WHERE l."id"=NEW."maintenance_location_id" AND l."organization_id"=NEW."organization_id" AND l."branch_id"=NEW."branch_id")
    THEN RAISE EXCEPTION 'bulk maintenance source mismatch'; END IF;
  ELSIF NEW."bulk_source_resolution_line_id" IS NOT NULL THEN
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
  IF NOT FOUND OR allocation_row."organization_id"<>NEW."organization_id" OR allocation_row."branch_id"<>NEW."branch_id"
    OR allocation_row."product_variant_id"<>NEW."product_variant_id" OR allocation_row."source_type"<>'MAINTENANCE'
    OR allocation_row."product_instance_id" IS NOT NULL OR allocation_row."bulk_source_resolution_line_id" IS NULL THEN
    RAISE EXCEPTION 'bulk maintenance event context mismatch';
  END IF;
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

CREATE OR REPLACE FUNCTION public.enforce_bulk_movement_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."bulk_resolution_line_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "bulk_physical_resolution_lines" l JOIN "bulk_physical_resolutions" r ON r."id"=l."resolution_id"
    WHERE l."id"=NEW."bulk_resolution_line_id" AND l."organization_id"=NEW."organization_id" AND l."product_variant_id"=NEW."product_variant_id"
      AND ((r."kind"='RETURN' AND NEW."type"='RENTAL_RETURN' AND NEW."quantity">0) OR (r."kind"='LOSS_RESOLUTION' AND NEW."type"='LOSS' AND NEW."quantity"<0))
  ) THEN RAISE EXCEPTION 'bulk movement resolution link mismatch'; END IF;
  IF NEW."bulk_maintenance_event_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "bulk_maintenance_events" e WHERE e."id"=NEW."bulk_maintenance_event_id" AND e."organization_id"=NEW."organization_id" AND e."product_variant_id"=NEW."product_variant_id"
  ) THEN RAISE EXCEPTION 'bulk movement maintenance link mismatch'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.prevent_bulk_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'bulk physical and maintenance history is immutable'; END; $$;

CREATE TRIGGER bulk_physical_resolutions_context BEFORE INSERT OR UPDATE ON "bulk_physical_resolutions" FOR EACH ROW EXECUTE FUNCTION public.enforce_bulk_resolution_context();
CREATE TRIGGER bulk_physical_resolution_lines_context BEFORE INSERT OR UPDATE ON "bulk_physical_resolution_lines" FOR EACH ROW EXECUTE FUNCTION public.enforce_bulk_resolution_line_context();
CREATE CONSTRAINT TRIGGER bulk_physical_resolutions_totals AFTER INSERT OR UPDATE ON "bulk_physical_resolutions" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bulk_resolution_totals();
CREATE CONSTRAINT TRIGGER bulk_physical_resolution_lines_totals AFTER INSERT OR UPDATE OR DELETE ON "bulk_physical_resolution_lines" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bulk_resolution_totals();
CREATE CONSTRAINT TRIGGER capacity_allocations_bulk_return_projection AFTER INSERT OR UPDATE OF issued_quantity,returned_quantity ON "capacity_allocations" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bulk_allocation_return_projection();
CREATE TRIGGER capacity_allocations_bulk_maintenance BEFORE INSERT OR UPDATE OF source_type,product_variant_id,product_instance_id,branch_id,quantity,maintenance_kind,maintenance_location_id,bulk_source_resolution_line_id ON "capacity_allocations" FOR EACH ROW EXECUTE FUNCTION public.enforce_bulk_maintenance_allocation();
CREATE TRIGGER bulk_maintenance_events_context BEFORE INSERT OR UPDATE ON "bulk_maintenance_events" FOR EACH ROW EXECUTE FUNCTION public.enforce_bulk_maintenance_event();
CREATE TRIGGER inventory_movements_bulk_link BEFORE INSERT OR UPDATE OF organization_id,product_variant_id,type,quantity,bulk_resolution_line_id,bulk_maintenance_event_id ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION public.enforce_bulk_movement_link();
CREATE TRIGGER bulk_physical_resolutions_immutable BEFORE UPDATE OR DELETE ON "bulk_physical_resolutions" FOR EACH ROW EXECUTE FUNCTION public.prevent_bulk_history_mutation();
CREATE TRIGGER bulk_physical_resolution_lines_immutable BEFORE UPDATE OR DELETE ON "bulk_physical_resolution_lines" FOR EACH ROW EXECUTE FUNCTION public.prevent_bulk_history_mutation();
CREATE TRIGGER bulk_maintenance_events_immutable BEFORE UPDATE OR DELETE ON "bulk_maintenance_events" FOR EACH ROW EXECUTE FUNCTION public.prevent_bulk_history_mutation();

ALTER TABLE public."bulk_physical_resolutions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bulk_physical_resolution_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bulk_maintenance_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."bulk_physical_resolutions", public."bulk_physical_resolution_lines", public."bulk_maintenance_events" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_resolution_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_resolution_line_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_resolution_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_allocation_return_projection() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_maintenance_allocation() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_maintenance_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_movement_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_bulk_history_mutation() FROM PUBLIC, anon, authenticated;
