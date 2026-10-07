-- Prepared for explicit owner-approved deployment only; no live execution.
ALTER TYPE "FinancialTransactionKind" ADD VALUE 'CASH_OPENING';
ALTER TYPE "FinancialTransactionKind" ADD VALUE 'CASH_EXPENSE';
ALTER TYPE "FinancialTransactionKind" ADD VALUE 'CASH_TRANSFER_OUT';
ALTER TYPE "FinancialTransactionKind" ADD VALUE 'CASH_TRANSFER_IN';
CREATE TYPE "CashAccountKind" AS ENUM ('CASH','NON_CASH');
CREATE TABLE cash_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, kind "CashAccountKind" NOT NULL,
 currency char(3) NOT NULL DEFAULT 'KZT' CHECK(currency='KZT'), created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(organization_id,branch_id,kind), UNIQUE(organization_id,branch_id,currency,id)
);
CREATE TABLE expense_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 name varchar(80) NOT NULL CHECK(length(trim(name))>0), is_active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(organization_id,name), UNIQUE(organization_id,id)
);
ALTER TABLE payment_methods ADD COLUMN cash_account_kind "CashAccountKind";
-- These codes already identify the corresponding channel in the CRM. Custom
-- methods remain unmapped until an authorized manager chooses their channel.
UPDATE payment_methods SET cash_account_kind=CASE WHEN code='CASH' THEN 'CASH'::"CashAccountKind" ELSE 'NON_CASH'::"CashAccountKind" END WHERE code IN ('CASH','KASPI','BANK_CARD','BANK_TRANSFER');
CREATE FUNCTION cash_method_initial_channel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.cash_account_kind IS NULL THEN
  IF NEW.code='CASH' THEN NEW.cash_account_kind:='CASH';
  ELSIF NEW.code IN ('KASPI','BANK_CARD','BANK_TRANSFER') THEN NEW.cash_account_kind:='NON_CASH'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_method_initial_cash_channel BEFORE INSERT ON payment_methods FOR EACH ROW EXECUTE FUNCTION cash_method_initial_channel();

ALTER TABLE financial_transactions ADD COLUMN cash_account_id uuid REFERENCES cash_accounts(id) ON DELETE RESTRICT,
 ADD COLUMN account_effect_minor bigint NOT NULL DEFAULT 0,
 ADD COLUMN expense_category_id uuid REFERENCES expense_categories(id) ON DELETE RESTRICT,
 ADD COLUMN expense_category_name varchar(80);
ALTER TABLE financial_transactions ADD CONSTRAINT financial_cash_account_context_fkey FOREIGN KEY(organization_id,branch_id,currency,cash_account_id) REFERENCES cash_accounts(organization_id,branch_id,currency,id) ON DELETE RESTRICT;
ALTER TABLE financial_transactions ADD CONSTRAINT financial_expense_category_tenant_fkey FOREIGN KEY(organization_id,expense_category_id) REFERENCES expense_categories(organization_id,id) ON DELETE RESTRICT;
CREATE INDEX financial_cash_account_history_idx ON financial_transactions(organization_id,cash_account_id,occurred_at,id);
CREATE INDEX financial_cash_operation_idx ON financial_transactions(organization_id,source_type,source_id);
ALTER TABLE financial_transactions DROP CONSTRAINT financial_transactions_positive_amount_check;
ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_positive_amount_check CHECK(amount_minor>0 OR amount_minor=0 AND kind::text IN ('CASH_OPENING','REVERSAL'));
-- Retain the existing financial and payroll checks; add only cash-module cases.
DO $$ DECLARE old_check text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO old_check FROM pg_constraint WHERE conrelid='financial_transactions'::regclass AND conname='financial_transactions_kind_effects_check';
 EXECUTE 'ALTER TABLE financial_transactions DROP CONSTRAINT financial_transactions_kind_effects_check';
 EXECUTE 'ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_kind_effects_check CHECK (('||old_check||') OR kind::text IN (''CASH_OPENING'',''CASH_EXPENSE'',''CASH_TRANSFER_OUT'',''CASH_TRANSFER_IN''))';
 SELECT pg_get_expr(conbin,conrelid) INTO old_check FROM pg_constraint WHERE conrelid='financial_transactions'::regclass AND conname='financial_transactions_payment_method_check';
 EXECUTE 'ALTER TABLE financial_transactions DROP CONSTRAINT financial_transactions_payment_method_check';
 EXECUTE 'ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_payment_method_check CHECK (('||old_check||') OR (cash_account_id IS NOT NULL AND payment_method_id IS NULL AND kind::text IN (''CASH_OPENING'',''CASH_EXPENSE'',''CASH_TRANSFER_OUT'',''CASH_TRANSFER_IN'',''REVERSAL'')))';
END $$;

CREATE FUNCTION enforce_cash_account_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'cash account branch tenant mismatch'; END IF;
 IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.branch_id,NEW.kind,NEW.currency) IS DISTINCT FROM (OLD.organization_id,OLD.branch_id,OLD.kind,OLD.currency) THEN RAISE EXCEPTION 'cash account identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_account_context BEFORE INSERT OR UPDATE ON cash_accounts FOR EACH ROW EXECUTE FUNCTION enforce_cash_account_context();

CREATE FUNCTION attach_and_validate_cash_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original financial_transactions%ROWTYPE; acct cash_accounts%ROWTYPE; channel "CashAccountKind"; movement bigint; native_cash boolean;
BEGIN
 IF NEW.kind::text='REVERSAL' THEN
  SELECT * INTO original FROM financial_transactions WHERE id=NEW.reversal_of_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cash reversal source missing'; END IF;
  IF NEW.cash_account_id IS NOT NULL AND NEW.cash_account_id IS DISTINCT FROM original.cash_account_id THEN RAISE EXCEPTION 'cash reversal account mismatch'; END IF;
  IF NEW.account_effect_minor<>0 AND NEW.account_effect_minor<>-original.account_effect_minor THEN RAISE EXCEPTION 'cash reversal effect mismatch'; END IF;
  IF NEW.expense_category_id IS NOT NULL AND NEW.expense_category_id IS DISTINCT FROM original.expense_category_id THEN RAISE EXCEPTION 'cash reversal category mismatch'; END IF;
  NEW.cash_account_id:=original.cash_account_id;
  NEW.account_effect_minor:=-original.account_effect_minor;
  NEW.expense_category_id:=original.expense_category_id;
  NEW.expense_category_name:=original.expense_category_name;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text||':cash-branch:'||NEW.branch_id::text,0));
 native_cash:=NEW.kind::text IN ('CASH_OPENING','CASH_EXPENSE','CASH_TRANSFER_OUT','CASH_TRANSFER_IN');
 movement:=NEW.cash_effect_minor-NEW.payroll_paid_minor;
 IF native_cash THEN
  IF NEW.cash_account_id IS NULL OR NEW.currency<>'KZT' OR NEW.customer_id IS NOT NULL OR NEW.order_id IS NOT NULL OR NEW.employee_membership_id IS NOT NULL OR NEW.related_transaction_id IS NOT NULL OR NEW.payment_method_id IS NOT NULL OR NEW.obligation_effect_minor<>0 OR NEW.revenue_effect_minor<>0 OR NEW.deposit_effect_minor<>0 THEN RAISE EXCEPTION 'invalid native cash dimensions'; END IF;
  IF NEW.kind::text='CASH_EXPENSE' THEN
   IF NEW.expense_category_id IS NULL OR NEW.expense_category_name IS NULL OR NEW.cash_effect_minor<>-NEW.amount_minor OR NEW.account_effect_minor<>-NEW.amount_minor THEN RAISE EXCEPTION 'invalid expense effects'; END IF;
   IF NOT EXISTS(SELECT 1 FROM expense_categories WHERE id=NEW.expense_category_id AND organization_id=NEW.organization_id AND is_active AND name=NEW.expense_category_name) THEN RAISE EXCEPTION 'expense category unavailable'; END IF;
  ELSE
   IF NEW.expense_category_id IS NOT NULL OR NEW.expense_category_name IS NOT NULL OR NEW.cash_effect_minor<>0 OR NEW.account_effect_minor<>(CASE WHEN NEW.kind::text='CASH_TRANSFER_OUT' THEN -NEW.amount_minor ELSE NEW.amount_minor END) THEN RAISE EXCEPTION 'invalid opening/transfer effects'; END IF;
  END IF;
 ELSE
  IF NEW.expense_category_id IS NOT NULL OR NEW.expense_category_name IS NOT NULL THEN RAISE EXCEPTION 'expense category only belongs to an expense'; END IF;
  IF movement=0 THEN
   IF NEW.cash_account_id IS NOT NULL OR NEW.account_effect_minor<>0 THEN RAISE EXCEPTION 'noncash posting cannot change an account'; END IF;
   RETURN NEW;
  END IF;
  IF NEW.cash_account_id IS NULL AND EXISTS(SELECT 1 FROM cash_accounts WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id) THEN
   SELECT cash_account_kind INTO channel FROM payment_methods WHERE id=NEW.payment_method_id AND organization_id=NEW.organization_id;
   IF channel IS NULL THEN RAISE EXCEPTION 'У способа оплаты не задан счёт. Настройте наличный или безналичный канал.'; END IF;
   SELECT id INTO NEW.cash_account_id FROM cash_accounts WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND kind=channel AND currency=NEW.currency;
   IF NEW.cash_account_id IS NULL THEN RAISE EXCEPTION 'Сначала задайте начальный остаток соответствующей кассы филиала в валюте KZT.'; END IF;
  END IF;
  -- No account setup means the legacy workflow remains explicitly unassigned.
  IF NEW.cash_account_id IS NULL THEN
   IF NEW.account_effect_minor<>0 THEN RAISE EXCEPTION 'unassigned posting has account effect'; END IF;
   RETURN NEW;
  END IF;
  IF NEW.account_effect_minor<>0 AND NEW.account_effect_minor<>movement THEN RAISE EXCEPTION 'account cash effect mismatch'; END IF;
  NEW.account_effect_minor:=movement;
 END IF;
 SELECT * INTO acct FROM cash_accounts WHERE id=NEW.cash_account_id FOR UPDATE;
 IF NOT FOUND OR acct.organization_id<>NEW.organization_id OR acct.branch_id<>NEW.branch_id OR acct.currency<>NEW.currency THEN RAISE EXCEPTION 'cash account context mismatch'; END IF;
 IF NEW.kind::text='CASH_OPENING' THEN
  IF EXISTS(SELECT 1 FROM financial_transactions f WHERE f.cash_account_id=acct.id AND f.kind::text='CASH_OPENING' AND NOT EXISTS(SELECT 1 FROM financial_transactions r WHERE r.reversal_of_id=f.id)) THEN RAISE EXCEPTION 'cash opening already exists'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM financial_transactions f WHERE f.cash_account_id=acct.id AND f.kind::text='CASH_OPENING' AND NOT EXISTS(SELECT 1 FROM financial_transactions r WHERE r.reversal_of_id=f.id)) THEN RAISE EXCEPTION 'Сначала задайте начальный остаток кассы.';
 END IF;
 IF NOT native_cash AND NEW.payment_method_id IS NOT NULL THEN
  SELECT cash_account_kind INTO channel FROM payment_methods WHERE id=NEW.payment_method_id;
  IF channel IS DISTINCT FROM acct.kind THEN RAISE EXCEPTION 'payment method account channel mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_cash_account_guard BEFORE INSERT ON financial_transactions FOR EACH ROW EXECUTE FUNCTION attach_and_validate_cash_movement();

CREATE FUNCTION enforce_cash_transfer_pair() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_kind text; n integer; net numeric; accounts integer; roots integer; low_amount bigint; high_amount bigint;
BEGIN
 root_kind:=NEW.kind::text;
 IF root_kind='REVERSAL' THEN SELECT kind::text INTO root_kind FROM financial_transactions WHERE id=NEW.reversal_of_id; END IF;
 IF root_kind NOT IN ('CASH_TRANSFER_OUT','CASH_TRANSFER_IN') THEN RETURN NEW; END IF;
 IF NEW.source_id IS NULL OR NEW.source_type NOT IN ('CASH_TRANSFER','CASH_TRANSFER_REVERSAL') THEN RAISE EXCEPTION 'transfer operation id missing'; END IF;
 SELECT count(*),coalesce(sum(account_effect_minor),0),count(DISTINCT cash_account_id),min(amount_minor),max(amount_minor) INTO n,net,accounts,low_amount,high_amount FROM financial_transactions WHERE organization_id=NEW.organization_id AND source_type=NEW.source_type AND source_id=NEW.source_id;
 IF n<>2 OR net<>0 OR accounts<>2 OR low_amount<>high_amount OR low_amount<=0 THEN RAISE EXCEPTION 'cash transfer must have two balanced account legs'; END IF;
 IF NEW.source_type='CASH_TRANSFER' THEN
  SELECT count(DISTINCT kind::text) INTO roots FROM financial_transactions WHERE organization_id=NEW.organization_id AND source_type=NEW.source_type AND source_id=NEW.source_id AND kind::text IN ('CASH_TRANSFER_OUT','CASH_TRANSFER_IN');
  IF roots<>2 THEN RAISE EXCEPTION 'invalid cash transfer kinds'; END IF;
 ELSE
  SELECT count(DISTINCT o.source_id) INTO roots FROM financial_transactions r JOIN financial_transactions o ON o.id=r.reversal_of_id WHERE r.organization_id=NEW.organization_id AND r.source_type=NEW.source_type AND r.source_id=NEW.source_id AND r.kind::text='REVERSAL' AND o.kind::text IN ('CASH_TRANSFER_OUT','CASH_TRANSFER_IN');
  IF roots<>1 THEN RAISE EXCEPTION 'transfer reversal must retain original pair'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER cash_transfer_pair_guard AFTER INSERT ON financial_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_cash_transfer_pair();

ALTER FUNCTION crm_seed_permission_roles(uuid) RENAME TO crm_seed_permission_roles_before_cash;
CREATE FUNCTION crm_seed_permission_roles(org uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM crm_seed_permission_roles_before_cash(org);
 UPDATE permission_roles SET permission_keys=(SELECT array_agg(DISTINCT k ORDER BY k) FROM unnest(permission_keys||ARRAY['CASH_ACCOUNT_VIEW','CASH_EXPENSE_CREATE','CASH_TRANSFER_CREATE','CASH_CORRECT','CASH_CATEGORY_MANAGE']) k)
 WHERE organization_id=org AND system_role='DIRECTOR' AND version=1;
END $$;
SELECT crm_seed_permission_roles(id) FROM organizations;
-- Modified bundles are never reset or implicitly granted new permissions.
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
