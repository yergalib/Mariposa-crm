CREATE TYPE "ProductImageStatus" AS ENUM ('ACTIVE', 'DELETED');
CREATE TYPE "StockAdjustmentType" AS ENUM ('INITIAL', 'CORRECTION');

ALTER TABLE "product_images"
  ADD COLUMN "status" "ProductImageStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "product_images_one_active_primary_per_product"
  ON "product_images"("organization_id", "product_id")
  WHERE ("is_primary" = true AND "status" = 'ACTIVE');

CREATE INDEX "product_images_organization_id_product_id_status_sort_idx"
  ON "product_images"("organization_id", "product_id", "status", "sort_order");

CREATE TABLE "inventory_counters" (
  "organization_id" UUID NOT NULL,
  "next_value" BIGINT NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "inventory_counters_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "inventory_counters_next_value_positive" CHECK ("next_value" > 0),
  CONSTRAINT "inventory_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Start after any pre-existing generated INV numbers while leaving legacy
-- identifiers untouched.
INSERT INTO "inventory_counters" ("organization_id", "next_value", "updated_at")
SELECT
  o."id",
  COALESCE(MAX(
    CASE
      WHEN pi."inventory_number" ~ '^INV-[0-9]+$'
      THEN SUBSTRING(pi."inventory_number" FROM 5)::BIGINT
      ELSE NULL
    END
  ), 0) + 1,
  CURRENT_TIMESTAMP
FROM "organizations" o
LEFT JOIN "product_instances" pi ON pi."organization_id" = o."id"
GROUP BY o."id";

CREATE TABLE "stock_adjustments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "stock_level_id" UUID NOT NULL,
  "type" "StockAdjustmentType" NOT NULL,
  "delta" INTEGER NOT NULL,
  "resulting_quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustments_delta_nonzero" CHECK ("delta" <> 0),
  CONSTRAINT "stock_adjustments_result_nonnegative" CHECK ("resulting_quantity" >= 0),
  CONSTRAINT "stock_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_adjustments_stock_level_id_fkey" FOREIGN KEY ("stock_level_id") REFERENCES "stock_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_adjustments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "stock_adjustments_organization_id_stock_level_id_created_idx"
  ON "stock_adjustments"("organization_id", "stock_level_id", "created_at");
