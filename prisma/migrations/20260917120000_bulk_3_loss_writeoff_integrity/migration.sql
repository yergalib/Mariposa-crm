-- BULK-3: require exact physical ledger provenance for loss and maintenance write-off.
CREATE OR REPLACE FUNCTION public.enforce_bulk_movement_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolution_kind "BulkPhysicalResolutionKind";
DECLARE source_quantity INTEGER;
DECLARE source_branch UUID;
DECLARE event_type "BulkMaintenanceEventType";
DECLARE event_quantity INTEGER;
DECLARE event_branch UUID;
BEGIN
  IF NEW."bulk_resolution_line_id" IS NOT NULL THEN
    SELECT r."kind",l."quantity",r."branch_id" INTO resolution_kind,source_quantity,source_branch
    FROM "bulk_physical_resolution_lines" l
    JOIN "bulk_physical_resolutions" r ON r."id"=l."resolution_id"
    WHERE l."id"=NEW."bulk_resolution_line_id"
      AND l."organization_id"=NEW."organization_id"
      AND l."product_variant_id"=NEW."product_variant_id";
    IF NOT FOUND
      OR ABS(NEW."quantity")<>source_quantity
      OR (resolution_kind='RETURN' AND (NEW."type"<>'RENTAL_RETURN' OR NEW."quantity"<=0 OR NEW."to_branch_id" IS DISTINCT FROM source_branch))
      OR (resolution_kind='LOSS_RESOLUTION' AND (NEW."type"<>'LOSS' OR NEW."quantity">=0 OR NEW."from_branch_id" IS DISTINCT FROM source_branch)) THEN
      RAISE EXCEPTION 'bulk movement resolution link mismatch';
    END IF;
  END IF;
  IF NEW."bulk_maintenance_event_id" IS NOT NULL THEN
    SELECT e."type",e."quantity",e."branch_id" INTO event_type,event_quantity,event_branch
    FROM "bulk_maintenance_events" e
    WHERE e."id"=NEW."bulk_maintenance_event_id"
      AND e."organization_id"=NEW."organization_id"
      AND e."product_variant_id"=NEW."product_variant_id";
    IF NOT FOUND
      OR ABS(NEW."quantity")<>event_quantity
      OR (event_type='WRITTEN_OFF' AND (NEW."type"<>'WRITE_OFF' OR NEW."quantity">=0 OR NEW."from_branch_id" IS DISTINCT FROM event_branch))
      OR (event_type IN ('COMPLETED','TRANSITIONED') AND NEW."type"<>'TRANSFER') THEN
      RAISE EXCEPTION 'bulk movement maintenance link mismatch';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.check_bulk_loss_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolution_kind "BulkPhysicalResolutionKind";
DECLARE linked_count INTEGER;
DECLARE linked_quantity INTEGER;
BEGIN
  SELECT r."kind" INTO resolution_kind
  FROM "bulk_physical_resolutions" r WHERE r."id"=NEW."resolution_id";
  IF resolution_kind<>'LOSS_RESOLUTION' THEN RETURN NULL; END IF;
  SELECT COUNT(*)::int,COALESCE(SUM(m."quantity"),0)::int INTO linked_count,linked_quantity
  FROM "inventory_movements" m
  WHERE m."bulk_resolution_line_id"=NEW."id" AND m."type"='LOSS';
  IF linked_count<>1 OR linked_quantity<>-NEW."quantity" THEN
    RAISE EXCEPTION 'bulk loss requires one exact LOSS movement';
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.check_bulk_writeoff_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_count INTEGER;
DECLARE linked_quantity INTEGER;
BEGIN
  IF NEW."type"<>'WRITTEN_OFF' THEN RETURN NULL; END IF;
  SELECT COUNT(*)::int,COALESCE(SUM(m."quantity"),0)::int INTO linked_count,linked_quantity
  FROM "inventory_movements" m
  WHERE m."bulk_maintenance_event_id"=NEW."id" AND m."type"='WRITE_OFF';
  IF linked_count<>1 OR linked_quantity<>-NEW."quantity" THEN
    RAISE EXCEPTION 'bulk maintenance write-off requires one exact WRITE_OFF movement';
  END IF;
  RETURN NULL;
END; $$;

CREATE CONSTRAINT TRIGGER bulk_loss_lines_movement_integrity
AFTER INSERT ON "bulk_physical_resolution_lines"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bulk_loss_movement();

CREATE CONSTRAINT TRIGGER bulk_writeoff_events_movement_integrity
AFTER INSERT ON "bulk_maintenance_events"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bulk_writeoff_movement();

REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_bulk_movement_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_loss_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_writeoff_movement() FROM PUBLIC, anon, authenticated;
