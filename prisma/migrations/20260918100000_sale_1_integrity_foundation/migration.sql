ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_ISSUE';

CREATE TYPE "SaleInventoryCommitmentStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED');

CREATE TABLE "sale_inventory_commitments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "product_instance_id" UUID,
  "branch_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "SaleInventoryCommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "idempotency_key" VARCHAR(150) NOT NULL,
  "provenance" VARCHAR(80) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_by_user_id" UUID,
  "terminal_at" TIMESTAMPTZ(3),
  "terminal_by_user_id" UUID,
  "terminal_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_inventory_commitments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_commitments_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "sale_commitments_terminal_check" CHECK (
    ("status"='ACTIVE' AND "terminal_at" IS NULL AND "terminal_by_user_id" IS NULL AND "terminal_reason" IS NULL)
    OR ("status" IN ('FULFILLED','CANCELLED') AND "terminal_at" IS NOT NULL AND "terminal_by_user_id" IS NOT NULL AND "terminal_reason" IS NOT NULL AND btrim("terminal_reason")<>'')
  ),
  CONSTRAINT "sale_inventory_commitments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "sale_inventory_commitments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "sale_inventory_commitments_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT,
  CONSTRAINT "sale_inventory_commitments_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  CONSTRAINT "sale_inventory_commitments_product_instance_id_fkey" FOREIGN KEY ("product_instance_id") REFERENCES "product_instances"("id") ON DELETE RESTRICT,
  CONSTRAINT "sale_inventory_commitments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "sale_inventory_commitments_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "sale_inventory_commitments_terminal_by_user_id_fkey" FOREIGN KEY ("terminal_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "sale_inventory_commitments_organization_id_idempotency_key_key" ON "sale_inventory_commitments"("organization_id","idempotency_key");
CREATE INDEX "sale_commitments_capacity_idx" ON "sale_inventory_commitments"("organization_id","product_variant_id","branch_id","status","confirmed_at");
CREATE INDEX "sale_inventory_commitments_organization_id_order_id_status_idx" ON "sale_inventory_commitments"("organization_id","order_id","status");
CREATE INDEX "sale_inventory_commitments_organization_id_order_item_id_status_idx" ON "sale_inventory_commitments"("organization_id","order_item_id","status");
CREATE INDEX "sale_inventory_commitments_organization_id_product_instance_id_status_idx" ON "sale_inventory_commitments"("organization_id","product_instance_id","status");
CREATE UNIQUE INDEX "sale_commitments_one_active_instance" ON "sale_inventory_commitments"("product_instance_id") WHERE "status"='ACTIVE' AND "product_instance_id" IS NOT NULL;

ALTER TABLE "inventory_movements" ADD COLUMN "sale_inventory_commitment_id" UUID;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sale_inventory_commitment_id_fkey" FOREIGN KEY ("sale_inventory_commitment_id") REFERENCES "sale_inventory_commitments"("id") ON DELETE RESTRICT;
CREATE INDEX "inventory_movements_organization_id_sale_commitment_idx" ON "inventory_movements"("organization_id","sale_inventory_commitment_id");

CREATE FUNCTION public.enforce_sale_commitment_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_row "orders"%ROWTYPE;
DECLARE item_row "order_items"%ROWTYPE;
DECLARE tracking "InventoryTrackingMode";
DECLARE instance_row "product_instances"%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('capacity:'||NEW."organization_id"::text||':'||NEW."branch_id"::text||':'||NEW."product_variant_id"::text,0));
  SELECT * INTO order_row FROM "orders" WHERE "id"=NEW."order_id";
  SELECT * INTO item_row FROM "order_items" WHERE "id"=NEW."order_item_id";
  SELECT p."tracking_mode" INTO tracking FROM "product_variants" v JOIN "products" p ON p."id"=v."product_id" WHERE v."id"=NEW."product_variant_id" AND v."organization_id"=NEW."organization_id";
  IF order_row."id" IS NULL OR order_row."organization_id"<>NEW."organization_id" OR order_row."type"<>'SALE' OR order_row."branch_id"<>NEW."branch_id" THEN RAISE EXCEPTION 'sale commitment order context mismatch'; END IF;
  IF item_row."id" IS NULL OR item_row."organization_id"<>NEW."organization_id" OR item_row."order_id"<>NEW."order_id" OR item_row."product_variant_id"<>NEW."product_variant_id" OR item_row."removed_at" IS NOT NULL THEN RAISE EXCEPTION 'sale commitment item context mismatch'; END IF;
  IF tracking IS NULL THEN RAISE EXCEPTION 'sale commitment variant context mismatch'; END IF;
  IF tracking='BULK' AND NEW."product_instance_id" IS NOT NULL THEN RAISE EXCEPTION 'BULK sale commitment cannot identify an instance'; END IF;
  IF tracking='SERIALIZED' THEN
    IF NEW."product_instance_id" IS NULL OR NEW."quantity"<>1 THEN RAISE EXCEPTION 'SERIALIZED sale commitment requires one instance'; END IF;
    SELECT * INTO instance_row FROM "product_instances" WHERE "id"=NEW."product_instance_id";
    IF instance_row."id" IS NULL OR instance_row."organization_id"<>NEW."organization_id" OR instance_row."product_variant_id"<>NEW."product_variant_id" OR instance_row."current_branch_id"<>NEW."branch_id" OR instance_row."operational_status"<>'AVAILABLE' OR instance_row."retired_at" IS NOT NULL THEN RAISE EXCEPTION 'sale commitment instance context mismatch'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.protect_sale_commitment_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'sale commitment history is immutable'; END IF;
  IF OLD."status"<>'ACTIVE' THEN RAISE EXCEPTION 'terminal sale commitment is immutable'; END IF;
  IF NEW."organization_id"<>OLD."organization_id" OR NEW."order_id"<>OLD."order_id" OR NEW."order_item_id"<>OLD."order_item_id" OR NEW."product_variant_id"<>OLD."product_variant_id" OR NEW."product_instance_id" IS DISTINCT FROM OLD."product_instance_id" OR NEW."branch_id"<>OLD."branch_id" OR NEW."quantity"<>OLD."quantity" OR NEW."idempotency_key"<>OLD."idempotency_key" OR NEW."provenance"<>OLD."provenance" OR NEW."confirmed_at"<>OLD."confirmed_at" OR NEW."confirmed_by_user_id" IS DISTINCT FROM OLD."confirmed_by_user_id" OR NEW."created_at"<>OLD."created_at" THEN RAISE EXCEPTION 'sale commitment provenance is immutable'; END IF;
  IF NEW."status" NOT IN ('FULFILLED','CANCELLED') THEN RAISE EXCEPTION 'invalid sale commitment transition'; END IF;
  IF NEW."status"='CANCELLED' AND EXISTS (SELECT 1 FROM "inventory_movements" m WHERE m."sale_inventory_commitment_id"=OLD."id") THEN RAISE EXCEPTION 'fulfilled sale commitment cannot be cancelled'; END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.enforce_sale_issue_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE commitment "sale_inventory_commitments"%ROWTYPE;
BEGIN
  IF NEW."type"='SALE_ISSUE' AND NEW."sale_inventory_commitment_id" IS NULL THEN RAISE EXCEPTION 'SALE_ISSUE requires sale commitment linkage'; END IF;
  IF NEW."sale_inventory_commitment_id" IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO commitment FROM "sale_inventory_commitments" WHERE "id"=NEW."sale_inventory_commitment_id";
  IF commitment."id" IS NULL OR NEW."type"<>'SALE_ISSUE' OR NEW."organization_id"<>commitment."organization_id" OR NEW."product_variant_id"<>commitment."product_variant_id" OR NEW."product_instance_id" IS DISTINCT FROM commitment."product_instance_id" OR NEW."from_branch_id" IS DISTINCT FROM commitment."branch_id" OR NEW."quantity">=0 THEN RAISE EXCEPTION 'SALE_ISSUE commitment linkage mismatch'; END IF;
  IF commitment."status"<>'ACTIVE' THEN RAISE EXCEPTION 'SALE_ISSUE requires active commitment'; END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.check_sale_fulfillment_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE moved INTEGER;
BEGIN
  IF NEW."status"<>'FULFILLED' THEN RETURN NULL; END IF;
  SELECT COALESCE(-SUM("quantity"),0)::int INTO moved FROM "inventory_movements" WHERE "sale_inventory_commitment_id"=NEW."id" AND "type"='SALE_ISSUE';
  IF moved<>NEW."quantity" THEN RAISE EXCEPTION 'fulfilled sale commitment requires exact SALE_ISSUE quantity'; END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER sale_inventory_commitments_context BEFORE INSERT ON "sale_inventory_commitments" FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_commitment_integrity();
CREATE TRIGGER sale_inventory_commitments_immutable BEFORE UPDATE OR DELETE ON "sale_inventory_commitments" FOR EACH ROW EXECUTE FUNCTION public.protect_sale_commitment_history();
CREATE TRIGGER inventory_movements_sale_link BEFORE INSERT ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_issue_link();
CREATE CONSTRAINT TRIGGER sale_commitments_fulfillment_projection AFTER INSERT OR UPDATE ON "sale_inventory_commitments" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_sale_fulfillment_projection();

ALTER TABLE "sale_inventory_commitments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "sale_inventory_commitments" FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_sale_commitment_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.protect_sale_commitment_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_sale_issue_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.check_sale_fulfillment_projection() FROM PUBLIC, anon, authenticated;
