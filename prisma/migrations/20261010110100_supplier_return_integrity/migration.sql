ALTER TABLE inventory_movements ADD COLUMN supplier_return_receipt_line_id UUID REFERENCES purchase_receipt_lines(id) ON DELETE RESTRICT, ADD COLUMN supplier_return_value_minor BIGINT;
CREATE INDEX inventory_supplier_return_receipt ON inventory_movements(organization_id,supplier_return_receipt_line_id);
ALTER TABLE inventory_movements ADD CONSTRAINT supplier_return_fields CHECK (
 (type='SUPPLIER_RETURN' AND supplier_return_receipt_line_id IS NOT NULL AND supplier_return_value_minor IS NOT NULL AND supplier_return_value_minor>=0 AND quantity<0 AND from_location_id IS NOT NULL AND to_branch_id IS NULL AND to_location_id IS NULL AND source_type='SUPPLIER_RETURN' AND source_id IS NOT NULL AND reason IS NOT NULL AND length(btrim(reason))>=3 AND created_by_user_id IS NOT NULL AND idempotency_key IS NOT NULL)
 OR (type<>'SUPPLIER_RETURN' AND supplier_return_receipt_line_id IS NULL AND supplier_return_value_minor IS NULL));
CREATE FUNCTION public.enforce_supplier_return() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line purchase_receipt_lines%ROWTYPE; receipt purchase_receipts%ROWTYPE; purchase purchases%ROWTYPE; instance product_instances%ROWTYPE; previous BIGINT; expected BIGINT; mode "InventoryTrackingMode";
BEGIN
 IF TG_OP<>'INSERT' THEN IF OLD.type='SUPPLIER_RETURN' THEN RAISE EXCEPTION 'supplier return history is immutable'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF NEW.type<>'SUPPLIER_RETURN' THEN RETURN NEW; END IF;
 SELECT * INTO line FROM purchase_receipt_lines WHERE id=NEW.supplier_return_receipt_line_id FOR UPDATE;
 SELECT * INTO receipt FROM purchase_receipts WHERE id=line.purchase_receipt_id;
 SELECT * INTO purchase FROM purchases WHERE id=receipt.purchase_id;
 IF line.id IS NULL OR line.organization_id<>NEW.organization_id OR line.product_variant_id<>NEW.product_variant_id OR receipt.branch_id IS DISTINCT FROM NEW.from_branch_id OR purchase.id IS DISTINCT FROM NEW.source_id OR purchase.status NOT IN ('PARTIALLY_RECEIVED','RECEIVED','CLOSED') THEN RAISE EXCEPTION 'supplier return receipt context mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM locations WHERE id=NEW.from_location_id AND organization_id=NEW.organization_id AND branch_id=receipt.branch_id AND is_active AND type NOT IN ('CLEANING','REPAIR','TRANSIT')) THEN RAISE EXCEPTION 'supplier return location mismatch'; END IF;
 SELECT COALESCE(-sum(quantity),0) INTO previous FROM inventory_movements WHERE supplier_return_receipt_line_id=line.id AND type='SUPPLIER_RETURN';
 IF previous-NEW.quantity>line.quantity THEN RAISE EXCEPTION 'supplier return exceeds receipt'; END IF;
 SELECT p.tracking_mode INTO mode FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=line.product_variant_id;
 IF mode='BULK' THEN
  IF NEW.product_instance_id IS NOT NULL THEN RAISE EXCEPTION 'bulk return cannot specify instance'; END IF;
  expected:=floor(line.total_acquisition_cost_minor::numeric*(previous-NEW.quantity)/line.quantity)-floor(line.total_acquisition_cost_minor::numeric*previous/line.quantity);
 ELSE
  SELECT * INTO instance FROM product_instances WHERE id=NEW.product_instance_id;
  IF instance.id IS NULL OR NEW.quantity<>-1 OR instance.organization_id<>NEW.organization_id OR instance.purchase_receipt_line_id IS DISTINCT FROM line.id OR instance.current_branch_id IS DISTINCT FROM receipt.branch_id OR instance.current_location_id IS DISTINCT FROM NEW.from_location_id OR instance.operational_status<>'RETURNED_TO_SUPPLIER' OR EXISTS(SELECT 1 FROM inventory_movements WHERE type='SUPPLIER_RETURN' AND product_instance_id=instance.id) THEN RAISE EXCEPTION 'supplier return instance context mismatch'; END IF;
  expected:=instance.purchase_cost_minor;
 END IF;
 IF expected IS NULL OR NEW.supplier_return_value_minor IS DISTINCT FROM expected THEN RAISE EXCEPTION 'supplier return cost mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER inventory_supplier_return_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION public.enforce_supplier_return();
REVOKE ALL ON FUNCTION public.enforce_supplier_return() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON FUNCTION public.enforce_supplier_return() FROM anon; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON FUNCTION public.enforce_supplier_return() FROM authenticated; END IF; END; $$;
