-- LOCAL CANDIDATE ONLY. Apply after the customer schema and explicit approval.
BEGIN;
ALTER TABLE assistant_telegram_customer_turns ADD COLUMN offered jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE assistant_telegram_customer_requests (
 id uuid PRIMARY KEY,
 binding_id uuid NOT NULL REFERENCES assistant_telegram_customers(id),
 stage_update_id bigint NOT NULL,
 request_hash text NOT NULL,
 draft jsonb NOT NULL,
 quote jsonb NOT NULL,
 history jsonb NOT NULL,
 inquiry_id uuid,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
 stage_delivery text NOT NULL DEFAULT 'unsent' CHECK(stage_delivery IN ('unsent','sending','sent','unknown')),
 confirm_delivery text NOT NULL DEFAULT 'unsent' CHECK(confirm_delivery IN ('unsent','sending','sent','unknown')),
 stage_message_id bigint,
 confirm_message_id bigint,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(binding_id,stage_update_id)
);
ALTER TABLE assistant_telegram_customer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_telegram_customer_requests FROM PUBLIC,anon,authenticated;
CREATE TABLE assistant_telegram_customer_delivery_parts (
 turn_id uuid NOT NULL REFERENCES assistant_telegram_customer_turns(id),
 part integer NOT NULL CHECK(part IN (0,1)),
 content_hash text NOT NULL,
 state text NOT NULL CHECK(state IN ('sending','sent','unknown')),
 telegram_message_id bigint,
 PRIMARY KEY(turn_id,part)
);
ALTER TABLE assistant_telegram_customer_delivery_parts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_telegram_customer_delivery_parts FROM PUBLIC,anon,authenticated;
COMMIT;
