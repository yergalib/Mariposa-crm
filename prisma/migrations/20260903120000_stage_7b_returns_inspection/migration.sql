-- Stage 7B extends the existing allocation lifecycle; no booking history is removed.
CREATE TYPE "ReturnInspectionResult" AS ENUM ('GOOD', 'NEEDS_CLEANING', 'DAMAGED');

ALTER TABLE "capacity_allocations"
  ADD COLUMN "issued_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "returned_at" TIMESTAMPTZ(3),
  ADD COLUMN "returned_by_user_id" UUID,
  ADD COLUMN "returned_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "return_inspection_result" "ReturnInspectionResult",
  ADD COLUMN "return_note" TEXT;

UPDATE "capacity_allocations"
SET "issued_quantity" = "quantity"
WHERE "issued_at" IS NOT NULL;

ALTER TABLE "capacity_allocations"
  ADD CONSTRAINT "capacity_allocations_issued_quantity_valid"
    CHECK ("issued_quantity" >= 0 AND "issued_quantity" <= "quantity"),
  ADD CONSTRAINT "capacity_allocations_returned_quantity_valid"
    CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "issued_quantity"),
  ADD CONSTRAINT "capacity_allocations_return_timestamp_valid"
    CHECK ("returned_at" IS NULL OR "returned_quantity" = "issued_quantity");

ALTER TABLE "capacity_allocations"
  ADD CONSTRAINT "capacity_allocations_returned_by_user_id_fkey"
  FOREIGN KEY ("returned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "capacity_allocations_organization_id_order_item_id_returned_at_idx"
  ON "capacity_allocations"("organization_id", "order_item_id", "returned_at");

ALTER TABLE "instance_condition_history"
  ADD COLUMN "source_type" TEXT,
  ADD COLUMN "source_id" UUID;
