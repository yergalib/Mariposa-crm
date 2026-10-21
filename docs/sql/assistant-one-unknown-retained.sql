-- Approved one-attempt reconciliation. Original ledger row is NEVER updated.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('assistant-provider:2157bde1-1994-465b-9f80-e1b740ee3cb1',0));
CREATE TABLE IF NOT EXISTS public.assistant_retained_unknown (
 attempt_id uuid PRIMARY KEY REFERENCES public.assistant_provider_attempts(id) ON DELETE RESTRICT,
 retained_nano bigint NOT NULL CHECK(retained_nano=47300000),
 reason text NOT NULL CHECK(reason='owner_approved_retained_unknown_20261021'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CHECK(attempt_id='a7d2c6a5-affb-4ec2-a66f-4a765837db99'::uuid)
);
ALTER TABLE public.assistant_retained_unknown ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_retained_unknown FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.assistant_retained_unknown_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Retained unknown audit is immutable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.assistant_provider_attempts a WHERE
 a.id=NEW.attempt_id AND a.organization_id='2157bde1-1994-465b-9f80-e1b740ee3cb1'::uuid
 AND a.membership_id='c580c434-53c7-4f37-a388-da443c4e426e'::uuid
 AND a.created_at='2026-10-21T19:07:58.148Z'::timestamptz AND a.created_at<now()-interval '5 minutes'
 AND a.input_bytes=5743 AND a.output_token_cap=300 AND a.model='gpt-6.1-sol'
 AND a.pricing_version='gpt-6.1-sol:2026-10-21:standard:2.00:0.10:2.50:10.00'
 AND a.call_kind='review' AND a.reserved_nano=NEW.retained_nano AND a.usage_state='reserved'
 AND a.actual_usage IS NULL AND a.actual_cost_nano IS NULL AND a.provider_response_id IS NULL
 AND a.lease_until='2026-10-25T19:00:00Z'::timestamptz)
 THEN RAISE EXCEPTION 'Exact approved unknown snapshot required'; END IF;
 RETURN NEW;
END;
$$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.assistant_retained_unknown'::regclass AND tgname='assistant_retained_unknown_guard') THEN
 CREATE TRIGGER assistant_retained_unknown_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assistant_retained_unknown FOR EACH ROW EXECUTE FUNCTION public.assistant_retained_unknown_guard();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.assistant_retained_unknown'::regclass AND tgname='assistant_retained_unknown_no_truncate') THEN
 CREATE TRIGGER assistant_retained_unknown_no_truncate BEFORE TRUNCATE ON public.assistant_retained_unknown FOR EACH STATEMENT EXECUTE FUNCTION public.assistant_retained_unknown_guard();
 END IF;
END $$;
INSERT INTO public.assistant_retained_unknown(attempt_id,retained_nano,reason)
SELECT 'a7d2c6a5-affb-4ec2-a66f-4a765837db99',47300000,'owner_approved_retained_unknown_20261021'
WHERE NOT EXISTS(SELECT 1 FROM public.assistant_retained_unknown WHERE attempt_id='a7d2c6a5-affb-4ec2-a66f-4a765837db99');
COMMIT;
