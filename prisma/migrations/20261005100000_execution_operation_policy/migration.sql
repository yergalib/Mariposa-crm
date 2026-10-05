-- Atomic additive schema only. Abort instead of waiting indefinitely for live traffic.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "direct_is_rentable_override" BOOLEAN,
ADD COLUMN     "direct_is_sellable_override" BOOLEAN,
ADD COLUMN     "direct_show_on_website_override" BOOLEAN;

-- AlterTable
ALTER TABLE "product_executions" ADD COLUMN     "is_rentable_override" BOOLEAN,
ADD COLUMN     "is_sellable_override" BOOLEAN,
ADD COLUMN     "show_on_website_override" BOOLEAN;

COMMIT;
