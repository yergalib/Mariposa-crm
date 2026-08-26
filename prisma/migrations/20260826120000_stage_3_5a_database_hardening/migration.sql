-- Stage 3.5A keeps existing inventory data and evolves allocations in place.
CREATE TYPE "InventoryTrackingMode" AS ENUM ('SERIALIZED', 'BULK');
CREATE TYPE "AllocationSourceType" AS ENUM ('ORDER', 'MAINTENANCE', 'TRANSFER', 'MANUAL_BLOCK');

ALTER TABLE "products"
  ADD COLUMN "tracking_mode" "InventoryTrackingMode" NOT NULL DEFAULT 'SERIALIZED',
  ADD COLUMN "turnaround_buffer_minutes" INTEGER;

ALTER TABLE "organization_settings"
  ADD COLUMN "turnaround_buffer_minutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "order_items"
  ADD COLUMN "adjustment_reason" TEXT;

CREATE TABLE "stock_levels" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "location_id" UUID,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_levels_quantity_nonnegative" CHECK ("quantity" >= 0),
  CONSTRAINT "stock_levels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_levels_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_levels_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "stock_levels_organization_id_product_variant_id_branch_id_idx"
  ON "stock_levels"("organization_id", "product_variant_id", "branch_id");

-- NULLS NOT DISTINCT makes a branch-level row (location_id IS NULL) unique too.
CREATE UNIQUE INDEX "stock_levels_tenant_variant_branch_location_key"
  ON "stock_levels"("organization_id", "product_variant_id", "branch_id", "location_id") NULLS NOT DISTINCT;

-- Preserve the table and all rows instead of drop/create.
ALTER TABLE "instance_allocations" RENAME TO "capacity_allocations";

ALTER TABLE "capacity_allocations"
  ALTER COLUMN "order_id" DROP NOT NULL,
  ALTER COLUMN "order_item_id" DROP NOT NULL,
  ALTER COLUMN "product_instance_id" DROP NOT NULL,
  ALTER COLUMN "blocked_until" DROP NOT NULL,
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "source_type" "AllocationSourceType" NOT NULL DEFAULT 'ORDER',
  ADD COLUMN "source_reference_id" UUID;

ALTER TYPE "AllocationStatus" RENAME TO "AllocationStatusLegacy";
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'RELEASED', 'CANCELLED');

ALTER TABLE "capacity_allocations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "capacity_allocations"
  ALTER COLUMN "status" TYPE "AllocationStatus"
  USING ((CASE
    WHEN "status"::text IN ('HOLD', 'RESERVED', 'PICKING') THEN 'ACTIVE'
    WHEN "status"::text IN ('ISSUED', 'RETURNED') THEN 'FULFILLED'
    WHEN "status"::text IN ('RELEASED', 'EXPIRED') THEN 'RELEASED'
    WHEN "status"::text = 'CANCELLED' THEN 'CANCELLED'
  END)::"AllocationStatus");
ALTER TABLE "capacity_allocations" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "AllocationStatusLegacy";

ALTER TABLE "capacity_allocations"
  ADD CONSTRAINT "capacity_allocations_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "capacity_allocations_period_valid" CHECK ("blocked_until" IS NULL OR "blocked_until" > "blocked_from"),
  ADD CONSTRAINT "capacity_allocations_instance_quantity_one" CHECK ("product_instance_id" IS NULL OR "quantity" = 1),
  ADD CONSTRAINT "capacity_allocations_order_source_link" CHECK ("source_type" <> 'ORDER' OR "order_item_id" IS NOT NULL);

ALTER INDEX "instance_allocations_organization_id_product_instance_id_bl_idx"
  RENAME TO "capacity_allocations_organization_id_product_instance_id_bl_idx";
ALTER INDEX "instance_allocations_organization_id_product_variant_id_bra_idx"
  RENAME TO "capacity_allocations_organization_id_product_variant_id_bra_idx";
ALTER INDEX "instance_allocations_organization_id_order_id_status_idx"
  RENAME TO "capacity_allocations_organization_id_order_id_status_idx";

ALTER TABLE "capacity_allocations"
  RENAME CONSTRAINT "instance_allocations_pkey" TO "capacity_allocations_pkey";

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- PostgreSQL evaluates tstzrange directly; Prisma continues to use its safe
-- DateTime columns. A NULL upper bound represents +infinity.
ALTER TABLE "capacity_allocations"
  ADD CONSTRAINT "capacity_allocations_no_active_instance_overlap"
  EXCLUDE USING gist (
    "product_instance_id" WITH =,
    tstzrange("blocked_from", "blocked_until", '[)') WITH &&
  )
  WHERE ("product_instance_id" IS NOT NULL AND "status" = 'ACTIVE');
