-- Preserve order-item and allocation history when a position is removed.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "removed_at" TIMESTAMPTZ(3);

CREATE INDEX IF NOT EXISTS "order_items_organization_id_order_id_removed_at_idx"
  ON "order_items"("organization_id", "order_id", "removed_at");
