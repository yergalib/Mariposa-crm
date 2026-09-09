CREATE TYPE "FinancialTransactionKind" AS ENUM ('RENTAL_CHARGE','SALE_CHARGE','DAMAGE_CHARGE','DISCOUNT','PAYMENT_RECEIVED','CUSTOMER_REFUND','DEPOSIT_RECEIVED','DEPOSIT_REFUNDED','DEPOSIT_WITHHELD','REVERSAL');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS','DENIED','FAILED');
CREATE TYPE "AuditSource" AS ENUM ('CRM','API','SYSTEM');

CREATE TABLE "payment_methods" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL, "display_name" VARCHAR(100) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_methods_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,49}$')
);
CREATE UNIQUE INDEX "payment_methods_organization_id_code_key" ON "payment_methods"("organization_id","code");
CREATE INDEX "payment_methods_organization_id_is_active_sort_order_idx" ON "payment_methods"("organization_id","is_active","sort_order");

INSERT INTO "payment_methods" ("organization_id","code","display_name","sort_order")
SELECT o."id",v."code",v."name",v."position" FROM "organizations" o CROSS JOIN
(VALUES ('CASH','Наличные',10),('KASPI','Kaspi',20),('BANK_CARD','Банковская карта',30),('BANK_TRANSFER','Банковский перевод',40),('OTHER','Другое',100)) v("code","name","position");

CREATE TABLE "financial_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL, "customer_id" UUID, "order_id" UUID,
  "kind" "FinancialTransactionKind" NOT NULL, "amount_minor" BIGINT NOT NULL,
  "obligation_effect_minor" BIGINT NOT NULL, "cash_effect_minor" BIGINT NOT NULL,
  "revenue_effect_minor" BIGINT NOT NULL, "deposit_effect_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL, "payment_method_id" UUID,
  "related_transaction_id" UUID, "reversal_of_id" UUID,
  "source_type" VARCHAR(80) NOT NULL, "source_id" UUID,
  "idempotency_key" VARCHAR(150) NOT NULL, "reason" VARCHAR(500),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_user_id" UUID, "actor_membership_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_transactions_positive_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "financial_transactions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "financial_transactions_source_type_check" CHECK (length(btrim("source_type")) > 0),
  CONSTRAINT "financial_transactions_reason_check" CHECK ("reason" IS NULL OR length(btrim("reason")) > 0),
  CONSTRAINT "financial_transactions_payment_method_check" CHECK (("cash_effect_minor" = 0 AND "payment_method_id" IS NULL) OR ("cash_effect_minor" <> 0 AND "payment_method_id" IS NOT NULL)),
  CONSTRAINT "financial_transactions_kind_effects_check" CHECK (
    ("kind" IN ('RENTAL_CHARGE','SALE_CHARGE','DAMAGE_CHARGE') AND "obligation_effect_minor"="amount_minor" AND "cash_effect_minor"=0 AND "revenue_effect_minor"="amount_minor" AND "deposit_effect_minor"=0) OR
    ("kind"='DISCOUNT' AND "obligation_effect_minor"=-"amount_minor" AND "cash_effect_minor"=0 AND "revenue_effect_minor"=-"amount_minor" AND "deposit_effect_minor"=0) OR
    ("kind"='PAYMENT_RECEIVED' AND "obligation_effect_minor"=-"amount_minor" AND "cash_effect_minor"="amount_minor" AND "revenue_effect_minor"=0 AND "deposit_effect_minor"=0) OR
    ("kind"='CUSTOMER_REFUND' AND "obligation_effect_minor"="amount_minor" AND "cash_effect_minor"=-"amount_minor" AND "revenue_effect_minor"=0 AND "deposit_effect_minor"=0) OR
    ("kind"='DEPOSIT_RECEIVED' AND "obligation_effect_minor"=0 AND "cash_effect_minor"="amount_minor" AND "revenue_effect_minor"=0 AND "deposit_effect_minor"="amount_minor") OR
    ("kind"='DEPOSIT_REFUNDED' AND "obligation_effect_minor"=0 AND "cash_effect_minor"=-"amount_minor" AND "revenue_effect_minor"=0 AND "deposit_effect_minor"=-"amount_minor") OR
    ("kind"='DEPOSIT_WITHHELD' AND "obligation_effect_minor"=-"amount_minor" AND "cash_effect_minor"=0 AND "revenue_effect_minor"=0 AND "deposit_effect_minor"=-"amount_minor") OR "kind"='REVERSAL'
  )
);
CREATE UNIQUE INDEX "financial_transactions_organization_id_idempotency_key_key" ON "financial_transactions"("organization_id","idempotency_key");
CREATE UNIQUE INDEX "financial_transactions_reversal_of_id_key" ON "financial_transactions"("reversal_of_id");
CREATE INDEX "financial_transactions_organization_id_occurred_at_idx" ON "financial_transactions"("organization_id","occurred_at");
CREATE INDEX "financial_transactions_organization_id_branch_id_occurred_at_idx" ON "financial_transactions"("organization_id","branch_id","occurred_at");
CREATE INDEX "financial_transactions_organization_id_order_id_occurred_at_idx" ON "financial_transactions"("organization_id","order_id","occurred_at");
CREATE INDEX "financial_transactions_organization_id_customer_id_occurred_at_idx" ON "financial_transactions"("organization_id","customer_id","occurred_at");
CREATE INDEX "financial_transactions_organization_id_payment_method_id_occurred_at_idx" ON "financial_transactions"("organization_id","payment_method_id","occurred_at");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID NOT NULL,
  "branch_id" UUID, "actor_user_id" UUID, "actor_membership_id" UUID,
  "action" VARCHAR(120) NOT NULL, "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(100), "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
  "source" "AuditSource" NOT NULL DEFAULT 'CRM', "correlation_id" VARCHAR(100),
  "metadata" JSONB, "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_action_check" CHECK (length(btrim("action")) > 0),
  CONSTRAINT "audit_logs_entity_type_check" CHECK (length(btrim("entity_type")) > 0),
  CONSTRAINT "audit_logs_metadata_size_check" CHECK ("metadata" IS NULL OR pg_column_size("metadata") <= 8192)
);
CREATE INDEX "audit_logs_organization_id_occurred_at_idx" ON "audit_logs"("organization_id","occurred_at");
CREATE INDEX "audit_logs_organization_id_branch_id_occurred_at_idx" ON "audit_logs"("organization_id","branch_id","occurred_at");
CREATE INDEX "audit_logs_organization_id_actor_user_id_occurred_at_idx" ON "audit_logs"("organization_id","actor_user_id","occurred_at");
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("organization_id","entity_type","entity_id","occurred_at");

ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_related_transaction_id_fkey" FOREIGN KEY ("related_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_actor_membership_id_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "organization_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_membership_id_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "organization_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION enforce_financial_transaction_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW."amount_minor"<>original_row."amount_minor" OR NEW."obligation_effect_minor"<>-original_row."obligation_effect_minor" OR NEW."cash_effect_minor"<>-original_row."cash_effect_minor" OR NEW."revenue_effect_minor"<>-original_row."revenue_effect_minor" OR NEW."deposit_effect_minor"<>-original_row."deposit_effect_minor" THEN RAISE EXCEPTION 'invalid reversal effects'; END IF;
 ELSIF NEW."reversal_of_id" IS NOT NULL THEN RAISE EXCEPTION 'reversal_of_id is only valid for reversal'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "financial_transactions_integrity_guard" BEFORE INSERT ON "financial_transactions" FOR EACH ROW EXECUTE FUNCTION enforce_financial_transaction_integrity();

CREATE FUNCTION enforce_audit_log_integrity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."branch_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "branches" b WHERE b."id"=NEW."branch_id" AND b."organization_id"=NEW."organization_id") THEN RAISE EXCEPTION 'audit branch tenant mismatch'; END IF;
 IF NEW."actor_membership_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "organization_memberships" m WHERE m."id"=NEW."actor_membership_id" AND m."organization_id"=NEW."organization_id" AND (NEW."actor_user_id" IS NULL OR m."user_id"=NEW."actor_user_id")) THEN RAISE EXCEPTION 'audit actor tenant mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "audit_logs_integrity_guard" BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_integrity();

CREATE FUNCTION prevent_financial_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'financial history is immutable';
END; $$;
CREATE TRIGGER "financial_transactions_immutable_update" BEFORE UPDATE OR DELETE ON "financial_transactions" FOR EACH ROW EXECUTE FUNCTION prevent_financial_history_mutation();
CREATE TRIGGER "audit_logs_immutable_update" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION prevent_financial_history_mutation();
