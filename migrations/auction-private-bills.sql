-- Explicit review migration. Never run automatically against production.
BEGIN;
CREATE TABLE IF NOT EXISTS auction_bill_account (
 id serial PRIMARY KEY, user_id text NOT NULL,
 auction_id integer NOT NULL REFERENCES auction_session(id),
 buyer_id integer NOT NULL REFERENCES auction_buyer(id),
 active_bill_id integer, revision integer NOT NULL DEFAULT 0,
 cleared_external_hash text, review_hold text,
 UNIQUE(user_id, auction_id, buyer_id)
);
CREATE TABLE IF NOT EXISTS auction_bill_snapshot (
 id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES auction_bill_account(id),
 revision integer NOT NULL, reference text NOT NULL, content_hash text NOT NULL,
 snapshot jsonb NOT NULL, due_cents integer NOT NULL CHECK(due_cents >= 0),
 adjustment_reason text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id, revision)
);
CREATE TABLE IF NOT EXISTS auction_bill_prepare_request (
 account_id integer NOT NULL REFERENCES auction_bill_account(id), request_key text NOT NULL,
 content_hash text NOT NULL, bill_id integer NOT NULL REFERENCES auction_bill_snapshot(id),
 PRIMARY KEY(account_id, request_key)
);
CREATE TABLE IF NOT EXISTS auction_bill_token (
 token_hash text PRIMARY KEY, bill_id integer NOT NULL REFERENCES auction_bill_snapshot(id),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auction_bill_payment_event (
 id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES auction_bill_account(id),
 user_id text NOT NULL, request_key text NOT NULL, event_hash text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('receipt','pending','settlement','reject','refund','reversal')),
 provider text NOT NULL CHECK(provider IN ('paypal','venmo','other')),
 transaction_ref text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents > 0),
 credit_cents integer NOT NULL, original_event_id integer REFERENCES auction_bill_payment_event(id),
 funds_available boolean NOT NULL, evidence_note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS auction_bill_transaction_unique
 ON auction_bill_payment_event(user_id, provider, transaction_ref)
 WHERE kind IN ('receipt','pending','refund','reversal');
CREATE UNIQUE INDEX IF NOT EXISTS auction_bill_pending_resolution_unique
 ON auction_bill_payment_event(original_event_id) WHERE kind IN ('settlement','reject');
CREATE TABLE IF NOT EXISTS auction_bill_review_audit (
 id serial PRIMARY KEY, account_id integer NOT NULL REFERENCES auction_bill_account(id),
 user_id text NOT NULL, evidence_hash text NOT NULL, note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auction_bill_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Bill snapshots and payment events are immutable'; END $$;
DROP TRIGGER IF EXISTS auction_bill_snapshot_immutable ON auction_bill_snapshot;
CREATE TRIGGER auction_bill_snapshot_immutable BEFORE UPDATE OR DELETE ON auction_bill_snapshot
 FOR EACH ROW EXECUTE FUNCTION auction_bill_immutable();
DROP TRIGGER IF EXISTS auction_bill_event_immutable ON auction_bill_payment_event;
CREATE TRIGGER auction_bill_event_immutable BEFORE UPDATE OR DELETE ON auction_bill_payment_event
 FOR EACH ROW EXECUTE FUNCTION auction_bill_immutable();
DROP TRIGGER IF EXISTS auction_bill_review_immutable ON auction_bill_review_audit;
CREATE TRIGGER auction_bill_review_immutable BEFORE UPDATE OR DELETE ON auction_bill_review_audit
 FOR EACH ROW EXECUTE FUNCTION auction_bill_immutable();

CREATE OR REPLACE FUNCTION auction_prepare_private_bill(
 p_user text, p_auction integer, p_buyer integer, p_hash text, p_snapshot jsonb,
 p_request text, p_expected integer, p_reason text
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE a auction_bill_account; b auction_bill_snapshot; old_request auction_bill_prepare_request; result_id integer;
BEGIN
 PERFORM 1 FROM auction_buyer buyer JOIN auction_session s ON s.id=buyer.auction_id
 WHERE buyer.id=p_buyer AND s.id=p_auction AND s.user_id=p_user FOR UPDATE OF buyer;
 IF NOT FOUND THEN RAISE EXCEPTION 'Buyer not found'; END IF;
 INSERT INTO auction_bill_account(user_id,auction_id,buyer_id) VALUES(p_user,p_auction,p_buyer)
 ON CONFLICT(user_id,auction_id,buyer_id) DO NOTHING;
 SELECT * INTO a FROM auction_bill_account WHERE user_id=p_user AND auction_id=p_auction AND buyer_id=p_buyer FOR UPDATE;
 SELECT * INTO old_request FROM auction_bill_prepare_request WHERE account_id=a.id AND request_key=p_request;
 IF FOUND THEN
  IF old_request.content_hash<>p_hash THEN RAISE EXCEPTION 'Request key already used for different bill'; END IF;
  RETURN old_request.bill_id;
 END IF;
 SELECT * INTO b FROM auction_bill_snapshot WHERE id=a.active_bill_id;
 IF FOUND AND b.content_hash=p_hash THEN result_id:=b.id;
 ELSE
  IF a.revision<>p_expected THEN RAISE EXCEPTION 'Bill changed; refresh before preparing'; END IF;
  IF a.revision>0 AND length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Explain the bill adjustment'; END IF;
  INSERT INTO auction_bill_snapshot(account_id,revision,reference,content_hash,snapshot,due_cents,adjustment_reason)
  VALUES(a.id,a.revision+1,'AH-A'||p_auction||'-B'||p_buyer,p_hash,p_snapshot,(p_snapshot->>'dueCents')::integer,nullif(p_reason,''))
  RETURNING id INTO result_id;
  UPDATE auction_bill_account SET active_bill_id=result_id,revision=revision+1 WHERE id=a.id;
 END IF;
 INSERT INTO auction_bill_prepare_request(account_id,request_key,content_hash,bill_id) VALUES(a.id,p_request,p_hash,result_id);
 RETURN result_id;
END $$;

CREATE OR REPLACE FUNCTION auction_record_bill_event(
 p_user text,p_account integer,p_request text,p_hash text,p_kind text,p_provider text,
 p_ref text,p_amount integer,p_original integer,p_available boolean,p_note text
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE a auction_bill_account; e auction_bill_payment_event; original auction_bill_payment_event;
 result_id integer; credit integer; refunded integer; settled integer;
BEGIN
 SELECT * INTO a FROM auction_bill_account WHERE id=p_account AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 SELECT * INTO e FROM auction_bill_payment_event WHERE user_id=p_user AND request_key=p_request;
 IF FOUND THEN
  IF e.account_id<>a.id THEN RAISE EXCEPTION 'Request key belongs to another buyer'; END IF;
  IF e.event_hash<>p_hash THEN RAISE EXCEPTION 'Request key already used for different payment'; END IF;
  RETURN e.id;
 END IF;
 IF p_amount<=0 OR p_amount>100000000 OR length(trim(p_note))<5 OR length(trim(p_ref))<3 THEN RAISE EXCEPTION 'Invalid payment evidence'; END IF;
 IF p_kind IN ('receipt','pending') THEN
  IF p_original IS NOT NULL THEN RAISE EXCEPTION 'Receipt cannot reference another event'; END IF;
  credit:=CASE WHEN p_kind='receipt' THEN p_amount ELSE 0 END;
 ELSE
  SELECT * INTO original FROM auction_bill_payment_event WHERE id=p_original AND account_id=a.id;
  IF NOT FOUND OR original.provider<>p_provider THEN RAISE EXCEPTION 'Original payment not found'; END IF;
  IF p_kind IN ('settlement','reject') THEN
   IF original.kind<>'pending' OR p_amount<>original.amount_cents THEN RAISE EXCEPTION 'Resolve the exact pending payment'; END IF;
   credit:=CASE WHEN p_kind='settlement' THEN p_amount ELSE 0 END;
  ELSIF p_kind IN ('refund','reversal') THEN
   IF original.kind NOT IN ('receipt','pending') THEN RAISE EXCEPTION 'Reference the original receipt'; END IF;
   SELECT coalesce(sum(credit_cents),0) INTO settled FROM auction_bill_payment_event
    WHERE id=original.id OR (original_event_id=original.id AND kind='settlement');
   SELECT coalesce(-sum(credit_cents),0) INTO refunded FROM auction_bill_payment_event
    WHERE original_event_id=original.id AND kind IN ('refund','reversal');
   IF p_amount>settled-refunded THEN RAISE EXCEPTION 'Refund exceeds verified payment'; END IF;
   credit:=-p_amount;
   UPDATE auction_bill_account SET review_hold='Refund or reversal requires review' WHERE id=a.id;
  ELSE RAISE EXCEPTION 'Invalid payment event'; END IF;
 END IF;
 INSERT INTO auction_bill_payment_event(account_id,user_id,request_key,event_hash,kind,provider,transaction_ref,
 amount_cents,credit_cents,original_event_id,funds_available,evidence_note)
 VALUES(a.id,p_user,p_request,p_hash,p_kind,p_provider,p_ref,p_amount,credit,p_original,p_available,p_note)
 RETURNING id INTO result_id;
 RETURN result_id;
END $$;
CREATE OR REPLACE FUNCTION auction_review_bill_hold(p_user text,p_account integer,p_hash text,p_note text,p_count integer)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE a auction_bill_account; actual_count integer;
BEGIN
 SELECT * INTO a FROM auction_bill_account WHERE id=p_account AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 SELECT count(*) INTO actual_count FROM auction_bill_payment_event WHERE account_id=a.id;
 IF actual_count<>p_count THEN RAISE EXCEPTION 'Payment evidence changed; refresh before reviewing'; END IF;
 UPDATE auction_bill_account SET cleared_external_hash=p_hash,review_hold=NULL WHERE id=a.id;
 INSERT INTO auction_bill_review_audit(account_id,user_id,evidence_hash,note) VALUES(a.id,p_user,p_hash,p_note);
 RETURN true;
END $$;
COMMIT;
