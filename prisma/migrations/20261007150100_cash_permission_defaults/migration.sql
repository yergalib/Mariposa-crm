-- Preserve prior explicit limits when introducing the approved director cash
-- template. Named/edited bundles are untouched; owners can configure new rights.
INSERT INTO membership_permission_overrides(id,organization_id,membership_id,permission_key,effect,created_at,updated_at)
SELECT gen_random_uuid(),m.organization_id,m.id,v.new_key,'DENY',now(),now()
FROM organization_memberships m
JOIN permission_roles r ON r.id=m.permission_role_id AND r.organization_id=m.organization_id
CROSS JOIN (VALUES
 ('CASH_ACCOUNT_VIEW','FINANCE_DASHBOARD_VIEW'),
 ('CASH_EXPENSE_CREATE','PAYMENT_CREATE'),
 ('CASH_TRANSFER_CREATE','PAYMENT_CREATE'),
 ('CASH_CORRECT','PAYMENT_REVERSE'),
 ('CASH_CATEGORY_MANAGE','SETTINGS_MANAGE')
) v(new_key,previous_key)
WHERE r.system_role='DIRECTOR' AND r.version=1
 AND EXISTS(SELECT 1 FROM membership_permission_overrides p WHERE p.membership_id=m.id AND p.permission_key=v.previous_key AND p.effect='DENY')
ON CONFLICT(membership_id,permission_key) DO NOTHING;
