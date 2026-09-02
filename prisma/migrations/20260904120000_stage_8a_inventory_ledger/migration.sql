CREATE TYPE "InventoryMovementType" AS ENUM ('INITIAL', 'RECEIPT', 'TRANSFER', 'RENTAL_ISSUE', 'RENTAL_RETURN', 'ADJUSTMENT', 'WRITE_OFF', 'LOSS', 'FOUND', 'RESTORE');

CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "product_instance_id" UUID,
  "type" "InventoryMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "from_branch_id" UUID,
  "from_location_id" UUID,
  "to_branch_id" UUID,
  "to_location_id" UUID,
  "source_type" TEXT NOT NULL,
  "source_id" UUID,
  "idempotency_key" TEXT,
  "reason" TEXT,
  "created_by_user_id" UUID,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_quantity_check" CHECK ("quantity" <> 0),
  CONSTRAINT "inventory_movements_serialized_quantity_check" CHECK ("product_instance_id" IS NULL OR abs("quantity") = 1)
);

CREATE UNIQUE INDEX "inventory_movements_organization_id_idempotency_key_key" ON "inventory_movements"("organization_id", "idempotency_key");
CREATE INDEX "inventory_movements_organization_id_occurred_at_idx" ON "inventory_movements"("organization_id", "occurred_at");
CREATE INDEX "inventory_movements_organization_id_product_variant_id_occurred_at_idx" ON "inventory_movements"("organization_id", "product_variant_id", "occurred_at");
CREATE INDEX "inventory_movements_organization_id_product_instance_id_occurred_at_idx" ON "inventory_movements"("organization_id", "product_instance_id", "occurred_at");
CREATE INDEX "inventory_movements_organization_id_type_occurred_at_idx" ON "inventory_movements"("organization_id", "type", "occurred_at");

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_instance_id_fkey" FOREIGN KEY ("product_instance_id") REFERENCES "product_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_branch_id_fkey" FOREIGN KEY ("to_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION prevent_inventory_movement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory movements are immutable';
END;
$$;
CREATE TRIGGER "inventory_movements_immutable_update" BEFORE UPDATE ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_mutation();
