-- CreateEnum
CREATE TYPE "PayrollClaimStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FinancialTransactionKind" ADD VALUE 'PAYROLL_SHIFT';
ALTER TYPE "FinancialTransactionKind" ADD VALUE 'PAYROLL_BONUS';
ALTER TYPE "FinancialTransactionKind" ADD VALUE 'PAYROLL_PAYOUT';

-- AlterTable
ALTER TABLE "financial_transactions" ADD COLUMN     "employee_membership_id" UUID,
ADD COLUMN     "payroll_accrued_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "payroll_paid_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "payroll_snapshot" JSONB;

-- CreateTable
CREATE TABLE "payroll_rates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "employee_membership_id" UUID NOT NULL,
    "weekday_minor" BIGINT NOT NULL,
    "weekend_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payroll_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_claims" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "employee_membership_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "status" "PayrollClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "creation_key" UUID NOT NULL,
    "creation_hash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "decision_reason" VARCHAR(500),
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "confirmation_key" UUID,
    "confirmation_hash" CHAR(64),
    "accrual_transaction_id" UUID,
    "payout_transaction_id" UUID,
    "approval_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payroll_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_rates_employee_membership_id_idx" ON "payroll_rates"("employee_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_rates_employee_branch_key" ON "payroll_rates"("organization_id", "branch_id", "employee_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_claims_accrual_transaction_id_key" ON "payroll_claims"("accrual_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_claims_payout_transaction_id_key" ON "payroll_claims"("payout_transaction_id");

-- CreateIndex
CREATE INDEX "payroll_claims_queue_idx" ON "payroll_claims"("organization_id", "branch_id", "status", "work_date", "id");

-- CreateIndex
CREATE INDEX "payroll_claims_own_idx" ON "payroll_claims"("organization_id", "employee_membership_id", "work_date", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_claims_organization_id_creation_key_key" ON "payroll_claims"("organization_id", "creation_key");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_claims_organization_id_confirmation_key_key" ON "payroll_claims"("organization_id", "confirmation_key");

-- CreateIndex
CREATE INDEX "financial_payroll_employee_idx" ON "financial_transactions"("organization_id", "branch_id", "employee_membership_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_employee_membership_id_fkey" FOREIGN KEY ("employee_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_rates" ADD CONSTRAINT "payroll_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_rates" ADD CONSTRAINT "payroll_rates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_rates" ADD CONSTRAINT "payroll_rates_employee_membership_id_fkey" FOREIGN KEY ("employee_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_claims" ADD CONSTRAINT "payroll_claims_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_claims" ADD CONSTRAINT "payroll_claims_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_claims" ADD CONSTRAINT "payroll_claims_employee_membership_id_fkey" FOREIGN KEY ("employee_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_claims" ADD CONSTRAINT "payroll_claims_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_claims" ADD CONSTRAINT "payroll_claims_accrual_transaction_id_fkey" FOREIGN KEY ("accrual_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_claims" ADD CONSTRAINT "payroll_claims_payout_transaction_id_fkey" FOREIGN KEY ("payout_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE financial_transactions DROP CONSTRAINT financial_transactions_kind_effects_check;
ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_kind_effects_check CHECK ((
    ("kind" IN ('RENTAL_CHARGE','SALE_CHARGE','DAMAGE_CHARGE') AND "obligation_effect_minor"="amount_minor" AND "cash_effect_minor"=0 AND "revenue_effect_minor"="amount_minor" AND "deposit_effect_minor"=0) OR
    ("kind"='DISCOUNT' AND "obligation_effect_minor"=-"amount_minor" AND "cash_effect_minor"=0 AND "revenue_effect_minor"=-"amount_minor" AND "deposit_effect_minor"=0) OR
    ("kind"='PAYMENT_RECEIVED' AND "obligation_effect_minor"=-"amount_minor" AND "cash_effect_minor"="amount_minor" AND "revenue_effect_minor"=0 AND "deposit_effect_minor"=0) OR
    ("kind"='CUSTOMER_REFUND' AND "obligation_effect_minor"="amount_minor" AND "cash_effect_minor"=-"amount_minor" AND "revenue_effect_minor"=0 AND "deposit_effect_minor"=0) OR
    ("kind"='DEPOSIT_RECEIVED' AND "obligation_effect_minor"=0 AND "cash_effect_minor"="amount_minor" AND "revenue_effect_minor"=0 AND "deposit_effect_minor"="amount_minor") OR
    ("kind"='DEPOSIT_REFUNDED' AND "obligation_effect_minor"=0 AND "cash_effect_minor"=-"amount_minor" AND "revenue_effect_minor"=0 AND "deposit_effect_minor"=-"amount_minor") OR
    ("kind"='DEPOSIT_WITHHELD' AND "obligation_effect_minor"=-"amount_minor" AND "cash_effect_minor"=0 AND "revenue_effect_minor"=0 AND "deposit_effect_minor"=-"amount_minor") OR "kind"='REVERSAL') OR kind::text IN ('PAYROLL_SHIFT','PAYROLL_BONUS','PAYROLL_PAYOUT'));
-- Payroll is a separate dimension of the existing immutable financial journal.
ALTER TABLE financial_transactions DROP CONSTRAINT financial_transactions_payment_method_check;
ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_payment_method_check CHECK (
 (employee_membership_id IS NULL AND ((cash_effect_minor=0 AND payment_method_id IS NULL) OR (cash_effect_minor<>0 AND payment_method_id IS NOT NULL))) OR
 (employee_membership_id IS NOT NULL AND ((payroll_paid_minor=0 AND payment_method_id IS NULL) OR (payroll_paid_minor<>0 AND payment_method_id IS NOT NULL)))
);
ALTER TABLE financial_transactions ADD CONSTRAINT financial_payroll_dimensions_check CHECK (
 (employee_membership_id IS NULL AND payroll_accrued_minor=0 AND payroll_paid_minor=0 AND payroll_snapshot IS NULL AND kind::text NOT IN ('PAYROLL_SHIFT','PAYROLL_BONUS','PAYROLL_PAYOUT')) OR
 (employee_membership_id IS NOT NULL AND customer_id IS NULL AND order_id IS NULL AND related_transaction_id IS NULL AND payroll_snapshot IS NOT NULL AND jsonb_typeof(payroll_snapshot)='object'
  AND obligation_effect_minor=0 AND cash_effect_minor=0 AND revenue_effect_minor=0 AND deposit_effect_minor=0
  AND ((kind::text IN ('PAYROLL_SHIFT','PAYROLL_BONUS') AND payroll_accrued_minor=amount_minor AND payroll_paid_minor=0)
    OR (kind::text='PAYROLL_PAYOUT' AND payroll_accrued_minor=0 AND payroll_paid_minor=amount_minor) OR kind::text='REVERSAL'))
);
ALTER TABLE payroll_rates ADD CONSTRAINT payroll_rate_amounts_check CHECK (weekday_minor>0 AND weekend_minor>0 AND weekday_minor<=999999999999 AND weekend_minor<=999999999999 AND currency ~ '^[A-Z]{3}$' AND version>0);
ALTER TABLE payroll_claims ADD CONSTRAINT payroll_claim_approval_check CHECK (
 (status::text IN ('SUBMITTED','REJECTED') AND accrual_transaction_id IS NULL AND payout_transaction_id IS NULL AND approval_snapshot IS NULL AND confirmation_key IS NULL AND confirmation_hash IS NULL) OR
 (status::text IN ('APPROVED','REVERSED') AND accrual_transaction_id IS NOT NULL AND payout_transaction_id IS NOT NULL AND approval_snapshot IS NOT NULL AND confirmation_key IS NOT NULL AND confirmation_hash IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
);
ALTER TABLE payroll_claims ADD CONSTRAINT payroll_claim_version_check CHECK (version>0);
CREATE UNIQUE INDEX payroll_claims_active_employee_day_key ON payroll_claims(organization_id,employee_membership_id,work_date) WHERE status IN ('SUBMITTED','APPROVED');

CREATE FUNCTION enforce_payroll_reference_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM branches WHERE id=NEW.branch_id AND organization_id=NEW.organization_id) OR NOT EXISTS (SELECT 1 FROM organization_memberships WHERE id=NEW.employee_membership_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'payroll reference tenant mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_rates_context BEFORE INSERT OR UPDATE ON payroll_rates FOR EACH ROW EXECUTE FUNCTION enforce_payroll_reference_context();
CREATE TRIGGER payroll_claims_context BEFORE INSERT OR UPDATE ON payroll_claims FOR EACH ROW EXECUTE FUNCTION enforce_payroll_reference_context();

CREATE FUNCTION enforce_payroll_financial_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original financial_transactions%ROWTYPE; DECLARE due BIGINT;
BEGIN
 IF NEW.kind::text='REVERSAL' THEN
  SELECT * INTO original FROM financial_transactions WHERE id=NEW.reversal_of_id;
  IF NEW.employee_membership_id IS DISTINCT FROM original.employee_membership_id OR NEW.payroll_accrued_minor IS DISTINCT FROM -original.payroll_accrued_minor OR NEW.payroll_paid_minor IS DISTINCT FROM -original.payroll_paid_minor OR NEW.payroll_snapshot IS DISTINCT FROM original.payroll_snapshot THEN RAISE EXCEPTION 'payroll reversal provenance mismatch'; END IF;
 END IF;
 IF NEW.employee_membership_id IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM organization_memberships WHERE id=NEW.employee_membership_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'payroll employee tenant mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || ':payroll:' || NEW.employee_membership_id::text,0));
 SELECT COALESCE(sum(payroll_accrued_minor-payroll_paid_minor),0) INTO due FROM financial_transactions WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND employee_membership_id=NEW.employee_membership_id AND currency=NEW.currency;
 IF due+NEW.payroll_accrued_minor-NEW.payroll_paid_minor<0 THEN RAISE EXCEPTION 'payroll payment exceeds accrued balance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_transactions_payroll_guard BEFORE INSERT ON financial_transactions FOR EACH ROW EXECUTE FUNCTION enforce_payroll_financial_integrity();

CREATE FUNCTION enforce_payroll_claim_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE accrued financial_transactions%ROWTYPE; DECLARE paid financial_transactions%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payroll claim history cannot be deleted'; END IF;
 IF ROW(NEW.organization_id,NEW.branch_id,NEW.employee_membership_id,NEW.work_date,NEW.timezone,NEW.creation_key,NEW.creation_hash,NEW.created_at) IS DISTINCT FROM ROW(OLD.organization_id,OLD.branch_id,OLD.employee_membership_id,OLD.work_date,OLD.timezone,OLD.creation_key,OLD.creation_hash,OLD.created_at) THEN RAISE EXCEPTION 'payroll claim basis is immutable'; END IF;
 IF NOT ((OLD.status::text='SUBMITTED' AND NEW.status::text IN ('APPROVED','REJECTED')) OR (OLD.status::text='APPROVED' AND NEW.status::text='REVERSED')) THEN RAISE EXCEPTION 'invalid payroll claim transition'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'payroll claim version must advance'; END IF;
 IF OLD.status::text='APPROVED' THEN
  IF ROW(NEW.accrual_transaction_id,NEW.payout_transaction_id,NEW.approval_snapshot,NEW.confirmation_key,NEW.confirmation_hash,NEW.reviewed_by_user_id,NEW.reviewed_at) IS DISTINCT FROM ROW(OLD.accrual_transaction_id,OLD.payout_transaction_id,OLD.approval_snapshot,OLD.confirmation_key,OLD.confirmation_hash,OLD.reviewed_by_user_id,OLD.reviewed_at) THEN RAISE EXCEPTION 'approved payroll snapshot is immutable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_transactions WHERE reversal_of_id=OLD.accrual_transaction_id) OR NOT EXISTS (SELECT 1 FROM financial_transactions WHERE reversal_of_id=OLD.payout_transaction_id) THEN RAISE EXCEPTION 'shift correction requires paired reversals'; END IF;
 END IF;
 IF NEW.status::text='APPROVED' THEN
  SELECT * INTO accrued FROM financial_transactions WHERE id=NEW.accrual_transaction_id;
  SELECT * INTO paid FROM financial_transactions WHERE id=NEW.payout_transaction_id;
  IF accrued.kind::text IS DISTINCT FROM 'PAYROLL_SHIFT' OR paid.kind::text IS DISTINCT FROM 'PAYROLL_PAYOUT' OR ROW(accrued.organization_id,accrued.branch_id,accrued.employee_membership_id,accrued.source_id) IS DISTINCT FROM ROW(NEW.organization_id,NEW.branch_id,NEW.employee_membership_id,NEW.id) OR ROW(paid.organization_id,paid.branch_id,paid.employee_membership_id,paid.source_id) IS DISTINCT FROM ROW(NEW.organization_id,NEW.branch_id,NEW.employee_membership_id,NEW.id) OR accrued.amount_minor IS DISTINCT FROM paid.amount_minor OR accrued.currency IS DISTINCT FROM paid.currency OR accrued.payroll_snapshot IS DISTINCT FROM NEW.approval_snapshot OR paid.payroll_snapshot IS DISTINCT FROM NEW.approval_snapshot THEN RAISE EXCEPTION 'shift approval requires matching accrual and payment'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_claims_history BEFORE UPDATE OR DELETE ON payroll_claims FOR EACH ROW EXECUTE FUNCTION enforce_payroll_claim_history();

CREATE FUNCTION check_payroll_shift_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE claim payroll_claims%ROWTYPE;
BEGIN
 IF NEW.source_type<>'PAYROLL_SHIFT_CONFIRMATION' THEN RETURN NULL; END IF;
 SELECT * INTO claim FROM payroll_claims WHERE id=NEW.source_id;
 IF NOT FOUND OR claim.status::text NOT IN ('APPROVED','REVERSED') OR (NEW.kind::text='PAYROLL_SHIFT' AND claim.accrual_transaction_id IS DISTINCT FROM NEW.id) OR (NEW.kind::text='PAYROLL_PAYOUT' AND claim.payout_transaction_id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'orphaned payroll shift posting'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payroll_shift_posting_complete AFTER INSERT ON financial_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_payroll_shift_posting();
ALTER TABLE payroll_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payroll_rates,payroll_claims FROM PUBLIC;
REVOKE ALL ON FUNCTION enforce_payroll_reference_context(),enforce_payroll_financial_integrity(),enforce_payroll_claim_history(),check_payroll_shift_posting() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON payroll_rates,payroll_claims FROM anon; REVOKE ALL ON FUNCTION enforce_payroll_reference_context(),enforce_payroll_financial_integrity(),enforce_payroll_claim_history(),check_payroll_shift_posting() FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON payroll_rates,payroll_claims FROM authenticated; REVOKE ALL ON FUNCTION enforce_payroll_reference_context(),enforce_payroll_financial_integrity(),enforce_payroll_claim_history(),check_payroll_shift_posting() FROM authenticated; END IF;
END $$;
