ALTER TABLE "orders"
ADD CONSTRAINT "orders_deposit_required_minor_nonnegative_check"
CHECK ("deposit_required_minor" >= 0);
