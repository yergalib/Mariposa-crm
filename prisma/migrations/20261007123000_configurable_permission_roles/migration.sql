-- Local candidate only. Explicit owner approval is required before live application.
CREATE TABLE permission_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name varchar(80) NOT NULL, system_role "MembershipRole", permission_keys text[] NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(organization_id,name), UNIQUE(organization_id,system_role), UNIQUE(organization_id,id),
 CHECK(system_role IS NULL OR system_role<>'OWNER'), CHECK(length(trim(name))>0)
);
ALTER TABLE organization_memberships ADD COLUMN permission_role_id uuid;
ALTER TABLE organization_memberships ADD CONSTRAINT organization_memberships_permission_role_id_fkey FOREIGN KEY(permission_role_id) REFERENCES permission_roles(id) ON DELETE RESTRICT;
ALTER TABLE organization_memberships ADD CONSTRAINT membership_permission_role_tenant_fkey FOREIGN KEY(organization_id,permission_role_id) REFERENCES permission_roles(organization_id,id) ON DELETE RESTRICT;
CREATE INDEX membership_permission_role_idx ON organization_memberships(organization_id,permission_role_id);
CREATE FUNCTION crm_seed_permission_roles(org uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO permission_roles(id,organization_id,name,system_role,permission_keys,version,created_at,updated_at) VALUES
 (gen_random_uuid(),org,'Директор','DIRECTOR',ARRAY['SHIFT_VIEW','PAYMENT_CREATE','TASK_VIEW','TASK_STATUS','FITTING_VIEW','FITTING_MANAGE','CATALOG_VIEW','CATALOG_PHOTO_MANAGE','CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','LEAD_VIEW','LEAD_CREATE','LEAD_EDIT','LEAD_CLOSE','LEAD_CONVERT_TO_ORDER','ORDER_VIEW','ORDER_CREATE','ORDER_EDIT','RENTAL_RESERVE','RENTAL_CONFIRM','RENTAL_PREPARE','RENTAL_ISSUE','RETURN_PROCESS','RETURN_INSPECT','MAINTENANCE_COMPLETE','INVENTORY_VIEW','INVENTORY_RECEIVE','STOCKTAKE_VIEW','STOCKTAKE_COUNT','NOTIFICATIONS_VIEW_ALL','TASK_VIEW_ALL','SHIFT_VIEW_ALL','PAYROLL_VIEW','PAYROLL_RATE_MANAGE','PAYROLL_CONFIRM','PAYROLL_REJECT','PAYROLL_BONUS','PAYROLL_PAYOUT','PAYROLL_REVERSE','SHIFT_MANAGE','TASK_MANAGE','ORDER_ASSIGN','FITTING_ASSIGN','ORDER_PRICE_OVERRIDE','ORDER_DISCOUNT_MANAGE','SETTINGS_VIEW','SETTINGS_MANAGE','LEAD_ASSIGN','CATALOG_CREATE','CATALOG_IMPORT','CATALOG_EDIT','CATALOG_ARCHIVE','CATALOG_PURCHASE_COST_VIEW','CUSTOMER_ARCHIVE','CUSTOMER_IMPORT','CUSTOMER_EXPORT','ORDER_EXPORT','ORDER_CANCEL','INVENTORY_EXPORT','INVENTORY_TRANSFER','INVENTORY_ADJUST','INVENTORY_WRITE_OFF','STOCKTAKE_RECONCILE','STAFF_VIEW','STAFF_INVITE','STAFF_EDIT','STAFF_DEACTIVATE','PAYMENT_VIEW','PAYMENT_REFUND','PAYMENT_REVERSE','DEPOSIT_VIEW','DEPOSIT_MANAGE','DEPOSIT_REFUND','DEPOSIT_WITHHOLD','DAMAGE_ASSESS','CUSTOMER_BALANCE_VIEW','FINANCE_DASHBOARD_VIEW','FINANCE_PURCHASE_COST_VIEW','FINANCE_MARGIN_VIEW','SUPPLIER_VIEW','SUPPLIER_MANAGE','PURCHASE_VIEW','PURCHASE_CREATE','PURCHASE_EDIT','PURCHASE_CANCEL','PURCHASE_RECEIVE','REPORT_FINANCE_VIEW']::text[],1,now(),now()),
(gen_random_uuid(),org,'Продавец','SELLER',ARRAY['SHIFT_VIEW','PAYMENT_CREATE','TASK_VIEW','TASK_STATUS','FITTING_VIEW','FITTING_MANAGE','CATALOG_VIEW','CATALOG_PHOTO_MANAGE','CUSTOMER_VIEW','CUSTOMER_CREATE','CUSTOMER_EDIT','LEAD_VIEW','LEAD_CREATE','LEAD_EDIT','LEAD_CLOSE','LEAD_CONVERT_TO_ORDER','ORDER_VIEW','ORDER_CREATE','ORDER_EDIT','RENTAL_RESERVE','RENTAL_CONFIRM','RENTAL_PREPARE','RENTAL_ISSUE','RETURN_PROCESS','RETURN_INSPECT','MAINTENANCE_COMPLETE','INVENTORY_VIEW','INVENTORY_RECEIVE','STOCKTAKE_VIEW','STOCKTAKE_COUNT']::text[],1,now(),now()),
(gen_random_uuid(),org,'Кассир','CASHIER',ARRAY['SHIFT_VIEW','PAYMENT_CREATE','CATALOG_VIEW','CUSTOMER_VIEW','ORDER_VIEW','INVENTORY_VIEW','STOCKTAKE_VIEW']::text[],1,now(),now())
 ON CONFLICT(organization_id,system_role) DO NOTHING;
END $$;
SELECT crm_seed_permission_roles(id) FROM organizations;
UPDATE organization_memberships m SET permission_role_id=r.id FROM permission_roles r WHERE r.organization_id=m.organization_id AND r.system_role=m.role AND m.role<>'OWNER';
-- New scopes previously depended on a role AND these operation permissions.
-- Preserve existing explicit denials when splitting those scopes into checkboxes.
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'TASK_VIEW_ALL','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['TASK_VIEW']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'SHIFT_VIEW_ALL','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['SHIFT_VIEW']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'PAYROLL_VIEW','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['FINANCE_DASHBOARD_VIEW']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'PAYROLL_RATE_MANAGE','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['FINANCE_DASHBOARD_VIEW','STAFF_EDIT']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'PAYROLL_CONFIRM','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['FINANCE_DASHBOARD_VIEW','SHIFT_MANAGE','PAYMENT_CREATE']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'PAYROLL_REJECT','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['FINANCE_DASHBOARD_VIEW','SHIFT_MANAGE']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'PAYROLL_BONUS','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['FINANCE_DASHBOARD_VIEW','PAYMENT_CREATE']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'PAYROLL_PAYOUT','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['FINANCE_DASHBOARD_VIEW','PAYMENT_CREATE']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,'PAYROLL_REVERSE','DENY',now(),now() FROM organization_memberships m WHERE m.role='DIRECTOR' AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=ANY(ARRAY['FINANCE_DASHBOARD_VIEW','PAYMENT_REVERSE']) AND p.effect='DENY') ON CONFLICT(membership_id,permission_key) DO NOTHING;
CREATE FUNCTION crm_permission_role_membership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.role='OWNER' THEN
   IF NEW.permission_role_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.role=OLD.role) THEN RAISE EXCEPTION 'Owner access is not a permission bundle'; END IF;
   NEW.permission_role_id:=NULL;
 ELSIF NEW.permission_role_id IS NULL OR (TG_OP='UPDATE' AND NEW.role<>OLD.role AND NEW.permission_role_id IS NOT DISTINCT FROM OLD.permission_role_id) THEN
   PERFORM crm_seed_permission_roles(NEW.organization_id);
   SELECT id INTO NEW.permission_role_id FROM permission_roles WHERE organization_id=NEW.organization_id AND system_role=NEW.role;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER membership_permission_role BEFORE INSERT OR UPDATE OF role,permission_role_id,organization_id ON organization_memberships FOR EACH ROW EXECUTE FUNCTION crm_permission_role_membership();
CREATE FUNCTION crm_permission_roles_organization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM crm_seed_permission_roles(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER organization_permission_roles AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION crm_permission_roles_organization();
ALTER TABLE permission_roles ENABLE ROW LEVEL SECURITY;
-- No browser/public policy: access is exclusively through authenticated CRM server guards.
