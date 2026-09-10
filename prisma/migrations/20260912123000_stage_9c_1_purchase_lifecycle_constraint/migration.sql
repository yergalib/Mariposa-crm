ALTER TABLE "purchases" DROP CONSTRAINT "purchases_lifecycle_check";
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_lifecycle_check" CHECK (
  ("status"='DRAFT' AND "confirmed_at" IS NULL) OR
  ("status" IN ('CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CLOSED') AND "confirmed_at" IS NOT NULL) OR
  "status"='CANCELLED'
);
