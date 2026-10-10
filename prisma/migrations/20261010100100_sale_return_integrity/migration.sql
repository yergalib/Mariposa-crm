ALTER TABLE inventory_movements ADD COLUMN sale_return_outcome "ReturnInspectionResult", ADD COLUMN sale_return_value_minor BIGINT;
ALTER TABLE capacity_allocations ADD COLUMN sale_return_movement_id UUID UNIQUE REFERENCES inventory_movements(id) ON DELETE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT sale_return_fields CHECK (
  (type='SALE_RETURN' AND sale_return_outcome IS NOT NULL AND sale_return_value_minor IS NOT NULL AND sale_return_value_minor>=0 AND quantity>0 AND to_location_id IS NOT NULL AND from_branch_id IS NULL AND from_location_id IS NULL AND source_type='SALE_RETURN' AND reason IS NOT NULL AND length(btrim(reason))>=3 AND created_by_user_id IS NOT NULL AND idempotency_key IS NOT NULL)
  OR (type<>'SALE_RETURN' AND sale_return_outcome IS NULL AND sale_return_value_minor IS NULL));

-- Preserve the existing issue guard verbatim for issues; returns use the same
-- commitment lock and immutable ledger, never a second stock model.
ALTER FUNCTION public.enforce_sale_issue_link() RENAME TO enforce_sale_issue_link_before_returns;
CREATE FUNCTION public.enforce_sale_return_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c sale_inventory_commitments%ROWTYPE; o orders%ROWTYPE; i order_items%ROWTYPE;
DECLARE issued BIGINT; returned BIGINT; prior BIGINT; total_lines NUMERIC; prefix NUMERIC; budget NUMERIC; loc locations%ROWTYPE;
BEGIN
 IF NEW.type<>'SALE_RETURN' THEN RETURN NEW; END IF;
 SELECT * INTO c FROM sale_inventory_commitments WHERE id=NEW.sale_inventory_commitment_id FOR UPDATE;
 SELECT * INTO o FROM orders WHERE id=c.order_id;
 SELECT * INTO i FROM order_items WHERE id=c.order_item_id;
 IF c.id IS NULL OR c.status<>'FULFILLED' OR o.type<>'SALE' OR o.status<>'COMPLETED' OR NEW.organization_id<>c.organization_id OR NEW.product_variant_id<>c.product_variant_id OR NEW.product_instance_id IS DISTINCT FROM c.product_instance_id OR NEW.to_branch_id IS DISTINCT FROM c.branch_id OR NEW.source_id IS DISTINCT FROM c.order_id THEN RAISE EXCEPTION 'sale return context mismatch'; END IF;
 SELECT * INTO loc FROM locations WHERE id=NEW.to_location_id AND organization_id=c.organization_id AND branch_id=c.branch_id AND is_active;
 IF loc.id IS NULL OR (NEW.sale_return_outcome='GOOD' AND loc.type NOT IN ('SHOWROOM','WAREHOUSE')) OR (NEW.sale_return_outcome='NEEDS_CLEANING' AND loc.type<>'CLEANING') OR (NEW.sale_return_outcome='DAMAGED' AND loc.type<>'REPAIR') THEN RAISE EXCEPTION 'sale return inspection location mismatch'; END IF;
 SELECT COALESCE(-SUM(quantity) FILTER(WHERE type='SALE_ISSUE'),0),COALESCE(SUM(quantity) FILTER(WHERE type='SALE_RETURN'),0) INTO issued,returned FROM inventory_movements WHERE sale_inventory_commitment_id=c.id;
 IF issued<>c.quantity OR returned+NEW.quantity>issued THEN RAISE EXCEPTION 'sale return exceeds issued quantity'; END IF;
 IF c.product_instance_id IS NOT NULL AND (NEW.quantity<>1 OR NOT EXISTS(SELECT 1 FROM product_instances WHERE id=c.product_instance_id AND operational_status='SOLD' AND retired_at IS NULL)) THEN RAISE EXCEPTION 'sale return instance not sold'; END IF;
 -- Serialize valuation across every commitment of the same original line.
 PERFORM 1 FROM order_items WHERE id=i.id FOR UPDATE;
 SELECT COALESCE(SUM(m.quantity),0) INTO prior FROM inventory_movements m JOIN sale_inventory_commitments sc ON sc.id=m.sale_inventory_commitment_id WHERE sc.order_item_id=i.id AND m.type='SALE_RETURN';
 SELECT COALESCE(SUM(line_total_minor),0),COALESCE(SUM(line_total_minor) FILTER(WHERE id<i.id),0) INTO total_lines,prefix FROM order_items WHERE order_id=o.id AND removed_at IS NULL;
 budget:=CASE WHEN total_lines=0 THEN 0 ELSE floor((prefix+i.line_total_minor)*o.total_minor/total_lines)-floor(prefix*o.total_minor/total_lines) END;
 IF NEW.sale_return_value_minor IS DISTINCT FROM (floor(budget*(prior+NEW.quantity)/i.quantity)-floor(budget*prior/i.quantity))::bigint THEN RAISE EXCEPTION 'sale return value differs from original discounted sale'; END IF;
 RETURN NEW;
END; $$;
-- The previous trigger excludes returns, while retaining its original checks.
DROP TRIGGER inventory_movements_sale_link ON inventory_movements;
CREATE TRIGGER inventory_movements_sale_link BEFORE INSERT ON inventory_movements FOR EACH ROW WHEN (NEW.type<>'SALE_RETURN') EXECUTE FUNCTION public.enforce_sale_issue_link_before_returns();
CREATE TRIGGER inventory_movements_sale_return_link BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_return_link();

CREATE FUNCTION public.enforce_sale_return_maintenance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m inventory_movements%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND NEW.sale_return_movement_id IS DISTINCT FROM OLD.sale_return_movement_id THEN RAISE EXCEPTION 'sale return maintenance source immutable'; END IF;
 IF NEW.sale_return_movement_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO m FROM inventory_movements WHERE id=NEW.sale_return_movement_id;
 IF m.type IS DISTINCT FROM 'SALE_RETURN' OR m.sale_return_outcome='GOOD' OR NEW.organization_id<>m.organization_id OR NEW.branch_id IS DISTINCT FROM m.to_branch_id OR NEW.product_variant_id<>m.product_variant_id OR NEW.quantity<>m.quantity OR NEW.source_type<>'MAINTENANCE' OR NEW.product_instance_id IS DISTINCT FROM m.product_instance_id OR NEW.maintenance_location_id IS DISTINCT FROM m.to_location_id OR NEW.maintenance_kind::text IS DISTINCT FROM (CASE WHEN m.sale_return_outcome='DAMAGED' THEN 'REPAIR' ELSE 'CLEANING' END) THEN RAISE EXCEPTION 'sale return maintenance context mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER capacity_sale_return_context BEFORE INSERT OR UPDATE ON capacity_allocations FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_return_maintenance();

-- Existing maintenance completion/transition logic accepts this additional
-- verifiable source; all other event and projection checks stay intact.
DO $$ DECLARE name TEXT; definition TEXT; changed TEXT;
BEGIN
 FOREACH name IN ARRAY ARRAY['enforce_bulk_maintenance_event','check_bulk_maintenance_projection'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
  changed:=replace(definition,'allocation_row."parent_maintenance_allocation_id" IS NULL)','allocation_row."parent_maintenance_allocation_id" IS NULL AND (allocation_row."sale_return_movement_id" IS NULL OR allocation_row."product_instance_id" IS NOT NULL))');
  IF changed=definition THEN RAISE EXCEPTION 'maintenance source guard not found: %',name; END IF;
  EXECUTE changed;
 END LOOP;
END; $$;

CREATE FUNCTION public.check_sale_return_credit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; m inventory_movements%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='inventory_movements' THEN target:=NEW.id; ELSE target:=NEW.source_id; END IF;
 SELECT * INTO m FROM inventory_movements WHERE id=target AND type='SALE_RETURN';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF m.sale_return_value_minor>0 AND NOT EXISTS(SELECT 1 FROM financial_transactions f JOIN sale_inventory_commitments c ON c.id=m.sale_inventory_commitment_id JOIN orders o ON o.id=c.order_id WHERE f.source_type='SALE_RETURN' AND f.source_id=m.id AND f.kind='DISCOUNT' AND f.organization_id=m.organization_id AND f.order_id=o.id AND f.customer_id=o.customer_id AND f.branch_id=o.branch_id AND f.currency=o.currency AND f.amount_minor=m.sale_return_value_minor AND f.cash_effect_minor=0 AND f.revenue_effect_minor=-m.sale_return_value_minor AND f.obligation_effect_minor=-m.sale_return_value_minor) THEN RAISE EXCEPTION 'sale return requires matching non-cash credit'; END IF;
 IF m.sale_return_outcome<>'GOOD' AND NOT EXISTS(SELECT 1 FROM capacity_allocations WHERE sale_return_movement_id=m.id) THEN RAISE EXCEPTION 'damaged sale return requires maintenance'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER sale_return_credit_projection AFTER INSERT ON inventory_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_sale_return_credit();
REVOKE ALL ON FUNCTION public.enforce_sale_return_link(), public.enforce_sale_return_maintenance(), public.check_sale_return_credit() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON FUNCTION public.enforce_sale_return_link(), public.enforce_sale_return_maintenance(), public.check_sale_return_credit() FROM anon'; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON FUNCTION public.enforce_sale_return_link(), public.enforce_sale_return_maintenance(), public.check_sale_return_credit() FROM authenticated'; END IF; END; $$;

CREATE UNIQUE INDEX financial_sale_return_credit_once ON financial_transactions(source_id) WHERE source_type='SALE_RETURN' AND kind='DISCOUNT';
CREATE FUNCTION public.enforce_sale_return_finance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m inventory_movements%ROWTYPE;
BEGIN
 IF NEW.reversal_of_id IS NOT NULL AND EXISTS(SELECT 1 FROM financial_transactions WHERE id=NEW.reversal_of_id AND source_type='SALE_RETURN') THEN RAISE EXCEPTION 'physical sale return credit cannot be reversed independently'; END IF;
 IF NEW.source_type<>'SALE_RETURN' THEN RETURN NEW; END IF;
 SELECT * INTO m FROM inventory_movements WHERE id=NEW.source_id AND type='SALE_RETURN';
 IF m.id IS NULL OR NEW.kind<>'DISCOUNT' OR NEW.organization_id<>m.organization_id OR NEW.amount_minor IS DISTINCT FROM m.sale_return_value_minor OR NEW.cash_effect_minor<>0 THEN RAISE EXCEPTION 'sale return credit context mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_sale_return_context BEFORE INSERT ON financial_transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_return_finance();
REVOKE ALL ON FUNCTION public.enforce_sale_return_finance() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON FUNCTION public.enforce_sale_return_finance() FROM anon'; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON FUNCTION public.enforce_sale_return_finance() FROM authenticated'; END IF; END; $$;

CREATE OR REPLACE FUNCTION public.enforce_bulk_maintenance_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_line "bulk_physical_resolution_lines"%ROWTYPE;
DECLARE source_resolution "bulk_physical_resolutions"%ROWTYPE;
DECLARE parent_row "capacity_allocations"%ROWTYPE;
DECLARE sale_movement inventory_movements%ROWTYPE;
DECLARE mode "InventoryTrackingMode";
BEGIN
  SELECT p."tracking_mode" INTO mode
  FROM "product_variants" v JOIN "products" p ON p."id"=v."product_id"
  WHERE v."id"=NEW."product_variant_id";

  IF NEW."source_type"<>'MAINTENANCE' THEN
    IF NEW."maintenance_kind" IS NOT NULL OR NEW."maintenance_location_id" IS NOT NULL
      OR NEW."bulk_source_resolution_line_id" IS NOT NULL OR NEW."parent_maintenance_allocation_id" IS NOT NULL OR NEW.sale_return_movement_id IS NOT NULL THEN
      RAISE EXCEPTION 'maintenance fields require maintenance allocation';
    END IF;
    RETURN NEW;
  END IF;

  IF mode='BULK' THEN
    IF NEW."product_instance_id" IS NOT NULL OR NEW."maintenance_kind" IS NULL OR NEW."maintenance_location_id" IS NULL
      OR num_nonnulls(NEW."bulk_source_resolution_line_id", NEW."parent_maintenance_allocation_id", NEW.sale_return_movement_id)<>1 THEN
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
    ELSIF NEW.sale_return_movement_id IS NOT NULL THEN
      SELECT * INTO sale_movement FROM inventory_movements WHERE id=NEW.sale_return_movement_id;
      IF sale_movement.id IS NULL OR sale_movement.type<>'SALE_RETURN' OR sale_movement.organization_id<>NEW.organization_id OR sale_movement.product_variant_id<>NEW.product_variant_id OR sale_movement.product_instance_id IS NOT NULL OR sale_movement.to_branch_id IS DISTINCT FROM NEW.branch_id OR sale_movement.to_location_id IS DISTINCT FROM NEW.maintenance_location_id OR sale_movement.quantity<>NEW.quantity OR NEW.blocked_from<sale_movement.occurred_at OR (NEW.maintenance_kind='REPAIR' AND sale_movement.sale_return_outcome<>'DAMAGED') OR (NEW.maintenance_kind='CLEANING' AND sale_movement.sale_return_outcome<>'NEEDS_CLEANING') THEN RAISE EXCEPTION 'bulk sale return maintenance source mismatch'; END IF;
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
