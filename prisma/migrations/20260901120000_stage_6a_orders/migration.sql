-- Stage 6A: additive order/reservation foundation.
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "OrderChannel" ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;

CREATE TABLE IF NOT EXISTS "order_counters" (
  "organization_id" UUID NOT NULL,
  "next_value" BIGINT NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_counters_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "order_counters_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "order_counters" ("organization_id", "next_value", "updated_at")
SELECT o."organization_id",
       COALESCE(MAX(NULLIF(regexp_replace(o."order_number", '[^0-9]', '', 'g'), '')::bigint), 0) + 1,
       CURRENT_TIMESTAMP
FROM "orders" o
GROUP BY o."organization_id"
ON CONFLICT ("organization_id") DO NOTHING;
