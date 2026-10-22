-- LOCAL REVIEW ONLY. Additive; never apply without approval. No backfill/delete.
BEGIN;
CREATE TABLE public.assistant_telegram_customers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  budget_membership_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  bot_id bigint NOT NULL CHECK (bot_id > 0),
  sender_id bigint NOT NULL CHECK (sender_id > 0),
  chat_id bigint NOT NULL CHECK (chat_id = sender_id),
  generation uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > starts_at),
  consent_version text, last_control_update bigint NOT NULL DEFAULT -1,
  UNIQUE (organization_id,bot_id,chat_id),
  UNIQUE(id,organization_id)
);
CREATE TABLE public.assistant_telegram_customer_turns (
  id uuid PRIMARY KEY,
  binding_id uuid NOT NULL REFERENCES public.assistant_telegram_customers(id),
  kind text NOT NULL DEFAULT 'dialogue' CHECK(kind IN ('dialogue','notice')),
  update_id bigint NOT NULL CHECK (update_id >= 0),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  envelope jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('planning','review_ready','review_running','complete','blocked')),
  candidate jsonb,
  result jsonb,
  history_input jsonb,
  history_reply jsonb,
  delivery_state text NOT NULL DEFAULT 'unsent' CHECK (delivery_state IN ('unsent','sending','sent','unknown')),
  telegram_message_id bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
  UNIQUE(binding_id,update_id),
  CHECK ((history_input IS NULL) = (history_reply IS NULL)),
  CHECK (history_input IS NULL OR state='complete'),
  CHECK (delivery_state<>'sent' OR telegram_message_id IS NOT NULL)
);

CREATE UNIQUE INDEX assistant_telegram_customer_active ON public.assistant_telegram_customer_turns(binding_id) WHERE kind='dialogue' AND (state IN ('planning','review_ready','review_running','blocked') OR (state='complete' AND history_input IS NULL));
CREATE TABLE public.assistant_telegram_customer_quotas (
 principal_id uuid NOT NULL REFERENCES public.assistant_telegram_customers(id),
 bucket text NOT NULL, count integer NOT NULL CHECK(count>=0), PRIMARY KEY(principal_id,bucket)
);
ALTER TABLE public.assistant_telegram_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_telegram_customer_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_telegram_customer_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_telegram_customers,public.assistant_telegram_customer_turns,public.assistant_telegram_customer_quotas FROM PUBLIC,anon,authenticated;
ALTER TABLE public.assistant_provider_attempts ADD COLUMN telegram_customer_turn_id uuid REFERENCES public.assistant_telegram_customer_turns(id);
CREATE FUNCTION public.assistant_customer_attempt_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.telegram_customer_turn_id IS DISTINCT FROM OLD.telegram_customer_turn_id THEN RAISE EXCEPTION 'Customer attempt attribution immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER assistant_customer_attempt_immutable BEFORE UPDATE ON public.assistant_provider_attempts FOR EACH ROW EXECUTE FUNCTION public.assistant_customer_attempt_immutable();

COMMIT;
