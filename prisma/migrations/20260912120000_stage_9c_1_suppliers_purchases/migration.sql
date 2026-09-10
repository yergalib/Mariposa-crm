CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "contact_name" VARCHAR(160),
  "phone" VARCHAR(50),
  "email" VARCHAR(254),
  "address" VARCHAR(500),
  "notes" VARCHAR(1000),
  "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "suppliers_archive_state_check" CHECK (("status"='ARCHIVED')=("archived_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "suppliers_organization_id_name_key" ON "suppliers"("organization_id", "name");
CREATE UNIQUE INDEX "suppliers_organization_name_normalized_key" ON "suppliers"("organization_id", lower(btrim("name")));
CREATE INDEX "suppliers_organization_id_status_name_idx" ON "suppliers"("organization_id", "status", "name");

CREATE TABLE "purchase_counters" (
  "organization_id" UUID NOT NULL,
  "next_value" BIGINT NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchase_counters_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "purchase_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_counters_next_value_check" CHECK ("next_value">0)
);

CREATE TABLE "purchases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "purchase_number" VARCHAR(40) NOT NULL,
  "supplier_id" UUID NOT NULL,
  "destination_branch_id" UUID NOT NULL,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" CHAR(3) NOT NULL,
  "subtotal_minor" BIGINT NOT NULL DEFAULT 0,
  "line_discount_total_minor" BIGINT NOT NULL DEFAULT 0,
  "additional_cost_minor" BIGINT NOT NULL DEFAULT 0,
  "total_minor" BIGINT NOT NULL DEFAULT 0,
  "external_reference" VARCHAR(120),
  "note" VARCHAR(1000),
  "creation_idempotency_key" VARCHAR(150) NOT NULL,
  "confirmed_idempotency_key" VARCHAR(150),
  "cancelled_idempotency_key" VARCHAR(150),
  "created_by_user_id" UUID,
  "confirmed_by_user_id" UUID,
  "cancelled_by_user_id" UUID,
  "confirmed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchases_destination_branch_id_fkey" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "purchases_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "purchases_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "purchases_money_check" CHECK ("subtotal_minor">=0 AND "line_discount_total_minor">=0 AND "additional_cost_minor">=0 AND "total_minor">=0 AND "total_minor"="subtotal_minor"-"line_discount_total_minor"+"additional_cost_minor"),
  CONSTRAINT "purchases_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "purchases_lifecycle_check" CHECK (("status"='CONFIRMED')=("confirmed_at" IS NOT NULL) OR "status" IN ('PARTIALLY_RECEIVED','RECEIVED','CLOSED')),
  CONSTRAINT "purchases_cancelled_state_check" CHECK (("status"='CANCELLED')=("cancelled_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "purchases_organization_id_purchase_number_key" ON "purchases"("organization_id", "purchase_number");
CREATE UNIQUE INDEX "purchases_organization_id_creation_idempotency_key_key" ON "purchases"("organization_id", "creation_idempotency_key");
CREATE INDEX "purchases_organization_id_status_created_at_idx" ON "purchases"("organization_id", "status", "created_at");
CREATE INDEX "purchases_organization_id_supplier_id_created_at_idx" ON "purchases"("organization_id", "supplier_id", "created_at");
CREATE INDEX "purchases_organization_id_destination_branch_id_created_at_idx" ON "purchases"("organization_id", "destination_branch_id", "created_at");

CREATE TABLE "purchase_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "ordered_quantity" INTEGER NOT NULL,
  "unit_cost_minor" BIGINT NOT NULL,
  "line_discount_minor" BIGINT NOT NULL DEFAULT 0,
  "allocated_additional_cost_minor" BIGINT NOT NULL DEFAULT 0,
  "line_total_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "variant_name_snapshot" TEXT NOT NULL,
  "sku_snapshot" TEXT NOT NULL,
  "supplier_model_snapshot" TEXT,
  "note" VARCHAR(500),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "purchase_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_items_values_check" CHECK ("ordered_quantity">0 AND "unit_cost_minor">=0 AND "line_discount_minor">=0 AND "line_discount_minor"<="unit_cost_minor"*"ordered_quantity" AND "allocated_additional_cost_minor">=0 AND "line_total_minor"="unit_cost_minor"*"ordered_quantity"-"line_discount_minor"+"allocated_additional_cost_minor"),
  CONSTRAINT "purchase_items_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE INDEX "purchase_items_organization_id_purchase_id_sort_order_idx" ON "purchase_items"("organization_id", "purchase_id", "sort_order");
CREATE INDEX "purchase_items_organization_id_product_variant_id_idx" ON "purchase_items"("organization_id", "product_variant_id");

CREATE OR REPLACE FUNCTION public.enforce_purchase_tenant_and_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase_row purchases%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='purchases' THEN
    IF NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id=NEW.supplier_id AND s.organization_id=NEW.organization_id) OR
       NOT EXISTS (SELECT 1 FROM branches b WHERE b.id=NEW.destination_branch_id AND b.organization_id=NEW.organization_id) THEN
      RAISE EXCEPTION 'Purchase tenant relationship mismatch';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status<>'DRAFT' AND ROW(NEW.supplier_id,NEW.destination_branch_id,NEW.currency,NEW.subtotal_minor,NEW.line_discount_total_minor,NEW.additional_cost_minor,NEW.total_minor,NEW.external_reference,NEW.note)
      IS DISTINCT FROM ROW(OLD.supplier_id,OLD.destination_branch_id,OLD.currency,OLD.subtotal_minor,OLD.line_discount_total_minor,OLD.additional_cost_minor,OLD.total_minor,OLD.external_reference,OLD.note) THEN
      RAISE EXCEPTION 'Confirmed purchase commercial data is immutable';
    END IF;
  ELSE
    SELECT * INTO purchase_row FROM purchases WHERE id=NEW.purchase_id;
    IF purchase_row.id IS NULL OR purchase_row.organization_id<>NEW.organization_id OR purchase_row.status<>'DRAFT' OR
       NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.id=NEW.product_variant_id AND v.organization_id=NEW.organization_id) THEN
      RAISE EXCEPTION 'Purchase item tenant or state mismatch';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER purchases_tenant_state BEFORE INSERT OR UPDATE ON "purchases" FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_tenant_and_state();
CREATE TRIGGER purchase_items_tenant_state BEFORE INSERT OR UPDATE ON "purchase_items" FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_tenant_and_state();

CREATE OR REPLACE FUNCTION public.prevent_locked_purchase_item_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM purchases p WHERE p.id=OLD.purchase_id AND p.status<>'DRAFT') THEN
    RAISE EXCEPTION 'Confirmed purchase items are immutable';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER purchase_items_locked_delete BEFORE DELETE ON "purchase_items" FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_purchase_item_delete();

ALTER TABLE public."suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."purchase_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."purchase_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."suppliers", public."purchase_counters", public."purchases", public."purchase_items" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_purchase_tenant_and_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_locked_purchase_item_delete() FROM PUBLIC, anon, authenticated;
