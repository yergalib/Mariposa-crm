DO $$
BEGIN
 IF EXISTS (
  SELECT 1
  FROM "financial_transactions" r
  LEFT JOIN "financial_transactions" o ON o."id"=r."reversal_of_id"
  WHERE r."kind"='REVERSAL' AND (
   o."id" IS NULL OR o."kind"='REVERSAL' OR
   r."organization_id" IS DISTINCT FROM o."organization_id" OR
   r."branch_id" IS DISTINCT FROM o."branch_id" OR
   r."order_id" IS DISTINCT FROM o."order_id" OR
   r."customer_id" IS DISTINCT FROM o."customer_id" OR
   r."currency" IS DISTINCT FROM o."currency" OR
   r."amount_minor" IS DISTINCT FROM o."amount_minor" OR
   r."payment_method_id" IS DISTINCT FROM o."payment_method_id" OR
   r."related_transaction_id" IS DISTINCT FROM o."related_transaction_id" OR
   r."obligation_effect_minor" IS DISTINCT FROM -o."obligation_effect_minor" OR
   r."cash_effect_minor" IS DISTINCT FROM -o."cash_effect_minor" OR
   r."revenue_effect_minor" IS DISTINCT FROM -o."revenue_effect_minor" OR
   r."deposit_effect_minor" IS DISTINCT FROM -o."deposit_effect_minor"
  )
 ) THEN RAISE EXCEPTION 'malformed financial reversal history requires manual reconciliation'; END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_financial_transaction_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original_row "financial_transactions"%ROWTYPE;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "branches" b WHERE b."id"=NEW."branch_id" AND b."organization_id"=NEW."organization_id") THEN RAISE EXCEPTION 'financial branch tenant mismatch'; END IF;
 IF NEW."customer_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "customers" c WHERE c."id"=NEW."customer_id" AND c."organization_id"=NEW."organization_id") THEN RAISE EXCEPTION 'financial customer tenant mismatch'; END IF;
 IF NEW."order_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "orders" o WHERE o."id"=NEW."order_id" AND o."organization_id"=NEW."organization_id" AND o."branch_id"=NEW."branch_id" AND (NEW."customer_id" IS NULL OR o."customer_id"=NEW."customer_id") AND o."currency"=NEW."currency") THEN RAISE EXCEPTION 'financial order context mismatch'; END IF;
 IF NEW."payment_method_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "payment_methods" p WHERE p."id"=NEW."payment_method_id" AND p."organization_id"=NEW."organization_id") THEN RAISE EXCEPTION 'financial payment method tenant mismatch'; END IF;
 IF NEW."actor_membership_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "organization_memberships" m WHERE m."id"=NEW."actor_membership_id" AND m."organization_id"=NEW."organization_id" AND (NEW."actor_user_id" IS NULL OR m."user_id"=NEW."actor_user_id")) THEN RAISE EXCEPTION 'financial actor tenant mismatch'; END IF;
 IF NEW."related_transaction_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "financial_transactions" f WHERE f."id"=NEW."related_transaction_id" AND f."organization_id"=NEW."organization_id" AND f."branch_id"=NEW."branch_id" AND f."currency"=NEW."currency") THEN RAISE EXCEPTION 'financial related transaction mismatch'; END IF;
 IF NEW."kind"='REVERSAL' THEN
  IF NEW."reversal_of_id" IS NULL OR NEW."reason" IS NULL THEN RAISE EXCEPTION 'reversal source and reason are required'; END IF;
  SELECT * INTO original_row FROM "financial_transactions" f WHERE f."id"=NEW."reversal_of_id" FOR UPDATE;
  IF NOT FOUND OR original_row."organization_id"<>NEW."organization_id" OR original_row."branch_id"<>NEW."branch_id" OR original_row."currency"<>NEW."currency" OR original_row."kind"='REVERSAL' THEN RAISE EXCEPTION 'invalid reversal source'; END IF;
  IF NEW."order_id" IS DISTINCT FROM original_row."order_id" OR NEW."customer_id" IS DISTINCT FROM original_row."customer_id" OR NEW."payment_method_id" IS DISTINCT FROM original_row."payment_method_id" OR NEW."related_transaction_id" IS DISTINCT FROM original_row."related_transaction_id" THEN RAISE EXCEPTION 'invalid reversal provenance'; END IF;
  IF NEW."amount_minor"<>original_row."amount_minor" OR NEW."obligation_effect_minor"<>-original_row."obligation_effect_minor" OR NEW."cash_effect_minor"<>-original_row."cash_effect_minor" OR NEW."revenue_effect_minor"<>-original_row."revenue_effect_minor" OR NEW."deposit_effect_minor"<>-original_row."deposit_effect_minor" THEN RAISE EXCEPTION 'invalid reversal effects'; END IF;
 ELSIF NEW."reversal_of_id" IS NOT NULL THEN RAISE EXCEPTION 'reversal_of_id is only valid for reversal'; END IF;
 RETURN NEW;
END; $$;
