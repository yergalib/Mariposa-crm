-- MARIPOSA is a server-only Prisma application. Internal CRM tables are not
-- intended to be queried through the Supabase Data API.

ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."auth_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."capacity_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."financial_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."instance_condition_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."instance_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."membership_branch_accesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."membership_permission_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organization_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organization_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payment_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sizes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_invitation_branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stocktake_bulk_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stocktake_expected_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stocktake_scans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stocktake_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;

-- Defense in depth: no direct table or sequence access for Supabase client
-- roles. No RLS policies are intentionally created for these roles.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- These are MARIPOSA trigger functions, not public RPC endpoints.
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_audit_log_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_financial_transaction_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_membership_permission_override_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_financial_history_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.prevent_inventory_movement_mutation() FROM PUBLIC, anon, authenticated;

-- Protect future Prisma objects created by the application migration role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated;

