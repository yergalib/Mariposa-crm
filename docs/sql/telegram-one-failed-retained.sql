-- Approved exact-turn closure. No provider ledger update, retry, refund or deletion.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('assistant-provider:2157bde1-1994-465b-9f80-e1b740ee3cb1',0));
ALTER TABLE public.assistant_telegram_customer_turns DROP CONSTRAINT assistant_telegram_customer_turns_state_check;
ALTER TABLE public.assistant_telegram_customer_turns ADD CONSTRAINT assistant_telegram_customer_turns_state_check
 CHECK(state IN ('planning','review_ready','review_running','complete','blocked') OR
 (state='failed_retained' AND id='05bc1aa6-a830-4208-b2a7-38c1b7a1183e'::uuid AND update_id=137001187
 AND kind='dialogue' AND candidate IS NULL AND result IS NULL AND history_input IS NULL AND history_reply IS NULL));
CREATE OR REPLACE FUNCTION public.telegram_exact_failed_retained_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.state='failed_retained' THEN
   RAISE EXCEPTION 'Retained failed turn is terminal and immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.state='failed_retained' THEN
   IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Existing blocked turn required'; END IF;
   IF OLD.state<>'blocked' OR (to_jsonb(OLD)-'state') IS DISTINCT FROM (to_jsonb(NEW)-'state')
     OR NEW.id<>'05bc1aa6-a830-4208-b2a7-38c1b7a1183e'::uuid
     OR NEW.update_id<>137001187 OR NEW.created_at<>'2026-10-22T14:18:53.053259Z'::timestamptz
     OR NOT EXISTS(SELECT 1 FROM public.assistant_provider_attempts a WHERE
       a.id='5eb71d8a-fb27-476a-a5f9-7897442ac256'::uuid AND a.telegram_customer_turn_id=NEW.id
       AND a.organization_id='2157bde1-1994-465b-9f80-e1b740ee3cb1'::uuid
       AND a.membership_id='c580c434-53c7-4f37-a388-da443c4e426e'::uuid
       AND a.created_at='2026-10-22T14:19:03.895Z'::timestamptz AND a.created_at<now()-interval '5 minutes'
       AND a.input_bytes=26873 AND a.output_token_cap=1400 AND a.call_kind='planning'
       AND a.model='gpt-6.1-sol' AND a.pricing_version='gpt-6.1-sol:2026-10-21:standard:2.00:0.10:2.50:10.00'
       AND a.reserved_nano=369512000 AND a.usage_state='reserved'
       AND a.actual_usage IS NULL AND a.actual_cost_nano IS NULL AND a.provider_response_id IS NULL
       AND a.lease_until='2026-10-25T19:00:00Z'::timestamptz)
   THEN RAISE EXCEPTION 'Exact approved blocked attempt required'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.assistant_telegram_customer_turns'::regclass AND tgname='telegram_exact_failed_retained_guard') THEN
   CREATE TRIGGER telegram_exact_failed_retained_guard BEFORE INSERT OR UPDATE OR DELETE ON public.assistant_telegram_customer_turns
   FOR EACH ROW EXECUTE FUNCTION public.telegram_exact_failed_retained_guard();
 END IF;
END $$;
DO $$ BEGIN
 UPDATE public.assistant_telegram_customer_turns SET state='failed_retained'
 WHERE id='05bc1aa6-a830-4208-b2a7-38c1b7a1183e'::uuid AND state='blocked';
 IF NOT EXISTS(SELECT 1 FROM public.assistant_telegram_customer_turns
   WHERE id='05bc1aa6-a830-4208-b2a7-38c1b7a1183e'::uuid AND state='failed_retained') THEN
   RAISE EXCEPTION 'Target failed turn absent or changed';
 END IF;
END $$;
COMMIT;
