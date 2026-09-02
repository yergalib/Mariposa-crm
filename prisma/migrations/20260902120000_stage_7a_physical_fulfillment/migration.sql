-- Stage 7A records readiness at order level and actual issue per serialized unit.
-- CapacityAllocation remains the single reservation/instance-assignment model.
ALTER TABLE "orders"
  ADD COLUMN "ready_at" TIMESTAMPTZ(3),
  ADD COLUMN "ready_by_user_id" UUID;

ALTER TABLE "capacity_allocations"
  ADD COLUMN "issued_at" TIMESTAMPTZ(3),
  ADD COLUMN "issued_by_user_id" UUID;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_ready_by_user_id_fkey"
  FOREIGN KEY ("ready_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "capacity_allocations"
  ADD CONSTRAINT "capacity_allocations_issued_by_user_id_fkey"
  FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "capacity_allocations_organization_id_order_item_id_issued_at_idx"
  ON "capacity_allocations"("organization_id", "order_item_id", "issued_at");
