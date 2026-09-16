CREATE UNIQUE INDEX "bulk_maintenance_events_related_allocation_id_key"
  ON "bulk_maintenance_events"("related_allocation_id")
  WHERE "related_allocation_id" IS NOT NULL;

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

  IF allocation_row."parent_maintenance_allocation_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "bulk_maintenance_events" e
    WHERE e."related_allocation_id"=allocation_row."id"
      AND e."capacity_allocation_id"=allocation_row."parent_maintenance_allocation_id"
      AND e."type"='TRANSITIONED' AND e."quantity"=allocation_row."quantity"
  ) THEN
    RAISE EXCEPTION 'child bulk maintenance requires immutable transition event';
  END IF;

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

REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_maintenance_projection() FROM PUBLIC, anon, authenticated;
