-- REVIEW CANDIDATE ONLY. Not an executable migration registration; never applied.
-- No WEB constraints changed, no backfill, no credentials, no external access.
BEGIN;
CREATE TABLE public.assistant_telegram_bindings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  bot_id bigint NOT NULL CHECK (bot_id > 0),
  sender_id bigint NOT NULL CHECK (sender_id > 0),
  chat_id bigint NOT NULL CHECK (chat_id = sender_id),
  generation uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > starts_at),
  UNIQUE (organization_id,bot_id,generation,chat_id)
);
CREATE TABLE public.assistant_telegram_turns (
  id uuid PRIMARY KEY,
  binding_id uuid NOT NULL REFERENCES public.assistant_telegram_bindings(id),
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
CREATE UNIQUE INDEX assistant_telegram_single_owner_binding ON public.assistant_telegram_bindings(organization_id,membership_id,bot_id) WHERE enabled;
CREATE TABLE public.assistant_telegram_enrollments (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, membership_id uuid NOT NULL,
  session_id uuid NOT NULL, branch_id uuid NOT NULL, bot_id bigint NOT NULL CHECK(bot_id>0),
  challenge_hash text NOT NULL UNIQUE CHECK(challenge_hash ~ '^[a-f0-9]{64}$'),
  sender_id bigint, chat_id bigint, confirmed_at timestamptz, expires_at timestamptz NOT NULL,
  CHECK ((sender_id IS NULL) = (chat_id IS NULL)),
  CHECK (sender_id IS NULL OR (sender_id>0 AND chat_id=sender_id)),
  CHECK (confirmed_at IS NULL OR sender_id IS NOT NULL)
);
ALTER TABLE public.assistant_telegram_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_telegram_enrollments FROM PUBLIC,anon,authenticated;
-- Uncertain/blocked turns intentionally keep chat lock. Expiry never refunds or
-- implicitly retries provider work. Resolution needs confirmed evidence.
CREATE UNIQUE INDEX assistant_telegram_one_active_turn ON public.assistant_telegram_turns(binding_id)
WHERE state IN ('planning','review_ready','review_running','blocked') OR (state='complete' AND history_input IS NULL);
ALTER TABLE public.assistant_telegram_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_telegram_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_telegram_bindings, public.assistant_telegram_turns FROM PUBLIC,anon,authenticated;
-- No Data API policies or grants. Existing privileged server access only after
-- binding, membership, permission, branch, consent and owner-window validation.
COMMIT;
-- Rollback: leave unused tables intact, disable transport in code. No DROP/delete.
