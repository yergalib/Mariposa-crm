CREATE OR REPLACE FUNCTION public.enforce_sale_issue_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE commitment "sale_inventory_commitments"%ROWTYPE;
DECLARE already_moved INTEGER;
BEGIN
  IF NEW."type"='SALE_ISSUE' AND NEW."sale_inventory_commitment_id" IS NULL THEN RAISE EXCEPTION 'SALE_ISSUE requires sale commitment linkage'; END IF;
  IF NEW."sale_inventory_commitment_id" IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO commitment FROM "sale_inventory_commitments" WHERE "id"=NEW."sale_inventory_commitment_id" FOR UPDATE;
  IF commitment."id" IS NULL OR NEW."type"<>'SALE_ISSUE' OR NEW."organization_id"<>commitment."organization_id" OR NEW."product_variant_id"<>commitment."product_variant_id" OR NEW."product_instance_id" IS DISTINCT FROM commitment."product_instance_id" OR NEW."from_branch_id" IS DISTINCT FROM commitment."branch_id" OR NEW."quantity">=0 THEN RAISE EXCEPTION 'SALE_ISSUE commitment linkage mismatch'; END IF;
  IF commitment."status"<>'ACTIVE' THEN RAISE EXCEPTION 'SALE_ISSUE requires active commitment'; END IF;
  SELECT COALESCE(-SUM("quantity"),0)::int INTO already_moved FROM "inventory_movements" WHERE "sale_inventory_commitment_id"=commitment."id" AND "type"='SALE_ISSUE';
  IF already_moved + (-NEW."quantity") > commitment."quantity" THEN RAISE EXCEPTION 'SALE_ISSUE quantity exceeds commitment'; END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.protect_sale_issue_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."sale_inventory_commitment_id" IS NOT NULL OR OLD."type"='SALE_ISSUE' THEN RAISE EXCEPTION 'SALE_ISSUE history is immutable'; END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER inventory_movements_sale_delete_guard BEFORE DELETE ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION public.protect_sale_issue_history();

REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_sale_issue_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.protect_sale_issue_history() FROM PUBLIC, anon, authenticated;
