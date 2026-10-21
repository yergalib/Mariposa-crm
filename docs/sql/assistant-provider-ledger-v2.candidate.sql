-- REVIEW CANDIDATE ONLY. Do not apply without explicit migration approval.
-- Additive, transactional; no UPDATE/backfill/DELETE, grants, policies or business tables.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.assistant_provider_attempts
 ADD COLUMN model text,
 ADD COLUMN pricing_version text,
 ADD COLUMN call_kind text,
 ADD COLUMN reserved_nano bigint,
 ADD COLUMN usage_state text,
 ADD COLUMN actual_usage jsonb,
 ADD COLUMN actual_cost_nano bigint,
 ADD COLUMN provider_response_id text;
ALTER TABLE public.assistant_provider_attempts ADD CONSTRAINT assistant_provider_receipt_shape CHECK (
 (model IS NULL AND pricing_version IS NULL AND call_kind IS NULL AND reserved_nano IS NULL AND usage_state IS NULL AND actual_usage IS NULL AND actual_cost_nano IS NULL AND provider_response_id IS NULL)
 OR
 (model IS NOT NULL AND length(model) BETWEEN 1 AND 100 AND pricing_version IS NOT NULL AND length(pricing_version) BETWEEN 1 AND 200
 AND call_kind IS NOT NULL AND call_kind IN ('planning','review','smoke') AND reserved_nano IS NOT NULL AND reserved_nano>0
 AND usage_state IS NOT NULL AND (
  (usage_state='reserved' AND actual_usage IS NULL AND actual_cost_nano IS NULL AND provider_response_id IS NULL)
  OR (usage_state='verified' AND actual_usage IS NOT NULL AND jsonb_typeof(actual_usage)='object'
      AND actual_cost_nano IS NOT NULL AND actual_cost_nano>=0 AND actual_cost_nano<=reserved_nano
      AND provider_response_id IS NOT NULL AND provider_response_id ~ '^resp_[A-Za-z0-9_-]{1,180}$')
 ))
);
CREATE UNIQUE INDEX assistant_provider_response_receipt_idx ON public.assistant_provider_attempts(provider_response_id) WHERE provider_response_id IS NOT NULL;
CREATE FUNCTION public.assistant_provider_immutable_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW.organization_id,NEW.membership_id,NEW.created_at,NEW.input_bytes,NEW.output_token_cap,NEW.model,NEW.pricing_version,NEW.call_kind,NEW.reserved_nano)
 IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.membership_id,OLD.created_at,OLD.input_bytes,OLD.output_token_cap,OLD.model,OLD.pricing_version,OLD.call_kind,OLD.reserved_nano)
 THEN RAISE EXCEPTION 'Provider attempt provenance is immutable'; END IF;
 IF OLD.usage_state IS NULL AND ROW(NEW.usage_state,NEW.actual_usage,NEW.actual_cost_nano,NEW.provider_response_id) IS DISTINCT FROM ROW(OLD.usage_state,OLD.actual_usage,OLD.actual_cost_nano,OLD.provider_response_id)
 THEN RAISE EXCEPTION 'Legacy attempt requires separate reconciliation'; END IF;
 IF OLD.usage_state='verified' AND ROW(NEW.usage_state,NEW.actual_usage,NEW.actual_cost_nano,NEW.provider_response_id,NEW.lease_until) IS DISTINCT FROM ROW(OLD.usage_state,OLD.actual_usage,OLD.actual_cost_nano,OLD.provider_response_id,OLD.lease_until)
 THEN RAISE EXCEPTION 'Verified provider receipt is immutable'; END IF;
 IF OLD.usage_state='reserved' AND NEW.usage_state='reserved' AND NEW.lease_until IS DISTINCT FROM OLD.lease_until
 THEN RAISE EXCEPTION 'Unverified attempt cannot release its lease'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER assistant_provider_immutable_receipt BEFORE UPDATE ON public.assistant_provider_attempts FOR EACH ROW EXECUTE FUNCTION public.assistant_provider_immutable_receipt();
COMMIT;
