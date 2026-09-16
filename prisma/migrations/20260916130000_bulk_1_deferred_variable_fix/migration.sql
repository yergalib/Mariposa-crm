CREATE OR REPLACE FUNCTION public.check_bulk_resolution_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_resolution_id UUID;
DECLARE resolution_row "bulk_physical_resolutions"%ROWTYPE;
DECLARE line_total INTEGER;
DECLARE returned_total INTEGER;
DECLARE lost_total INTEGER;
DECLARE projected_returned INTEGER;
BEGIN
  IF TG_TABLE_NAME='bulk_physical_resolutions' THEN
    IF TG_OP='DELETE' THEN target_resolution_id := OLD."id"; ELSE target_resolution_id := NEW."id"; END IF;
  ELSE
    IF TG_OP='DELETE' THEN target_resolution_id := OLD."resolution_id"; ELSE target_resolution_id := NEW."resolution_id"; END IF;
  END IF;
  SELECT * INTO resolution_row FROM "bulk_physical_resolutions" r WHERE r."id"=target_resolution_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(l."quantity"),0)::int INTO line_total
  FROM "bulk_physical_resolution_lines" l WHERE l."resolution_id"=target_resolution_id;
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

REVOKE ALL PRIVILEGES ON FUNCTION public.check_bulk_resolution_totals() FROM PUBLIC, anon, authenticated;
