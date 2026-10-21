-- LOCAL REVIEW CANDIDATE: NOT APPLIED. New migration approval required.
-- Operational checkpoint, not consented conversation history. No business writes.
BEGIN;
CREATE TABLE public.assistant_review_checkpoints (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 membership_id uuid NOT NULL REFERENCES public.organization_memberships(id),
 principal_hash text NOT NULL CHECK(principal_hash ~ '^[a-f0-9]{64}$'),
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('planning','review_ready','review_running','complete','blocked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 candidate jsonb,
 result jsonb,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
 CHECK(candidate IS NULL OR octet_length(candidate::text)<=64000),
 CHECK(result IS NULL OR octet_length(result::text)<=64000),
 CHECK((state='planning' AND candidate IS NULL AND result IS NULL)
 OR (state IN ('review_ready','review_running') AND candidate IS NOT NULL AND result IS NULL)
 OR (state='complete' AND candidate IS NOT NULL AND result IS NOT NULL)
 OR (state='blocked' AND result IS NULL)),
 UNIQUE(organization_id,membership_id,principal_hash,idempotency_key)
);
ALTER TABLE public.assistant_review_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_review_checkpoints FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.assistant_review_checkpoint_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW.organization_id,NEW.membership_id,NEW.principal_hash,NEW.idempotency_key,NEW.request_hash,NEW.created_at,NEW.expires_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.membership_id,OLD.principal_hash,OLD.idempotency_key,OLD.request_hash,OLD.created_at,OLD.expires_at)
 THEN RAISE EXCEPTION 'Checkpoint identity is immutable'; END IF;
 IF NOT ((OLD.state='planning' AND NEW.state IN ('review_ready','blocked'))
 OR (OLD.state='review_ready' AND NEW.state IN ('review_running','blocked'))
 OR (OLD.state='review_running' AND NEW.state IN ('complete','blocked')))
 THEN RAISE EXCEPTION 'Checkpoint transition cannot be replayed'; END IF;
 IF OLD.candidate IS NOT NULL AND NEW.candidate IS DISTINCT FROM OLD.candidate
 THEN RAISE EXCEPTION 'Stored candidate cannot be changed or removed'; END IF;
 IF NEW.state<>'blocked' AND clock_timestamp()>=NEW.expires_at THEN RAISE EXCEPTION 'Checkpoint expired'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER assistant_review_checkpoint_guard BEFORE UPDATE ON public.assistant_review_checkpoints FOR EACH ROW EXECUTE FUNCTION public.assistant_review_checkpoint_guard();
COMMIT;
