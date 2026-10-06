BEGIN;
CREATE TABLE IF NOT EXISTS auction_bill_checkout_attempt (
 id text PRIMARY KEY,
 account_id integer NOT NULL REFERENCES auction_bill_account(id),
 bill_id integer NOT NULL REFERENCES auction_bill_snapshot(id),
 content_hash text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents>0),
 order_id text UNIQUE, approval_url text,
 state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','pending','captured','review')),
 payment_event_id integer REFERENCES auction_bill_payment_event(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- One durable attempt per account. Provider timeouts/retries never allocate a fresh order.
CREATE UNIQUE INDEX IF NOT EXISTS auction_bill_one_checkout ON auction_bill_checkout_attempt(account_id);
CREATE OR REPLACE FUNCTION auction_begin_checkout(p_account integer,p_bill integer,p_hash text,p_amount integer,p_attempt text)
RETURNS auction_bill_checkout_attempt LANGUAGE plpgsql AS $$
DECLARE a auction_bill_account; t auction_bill_checkout_attempt; b auction_bill_snapshot; credits integer;
BEGIN
 SELECT * INTO a FROM auction_bill_account WHERE id=p_account FOR UPDATE;
 SELECT * INTO b FROM auction_bill_snapshot WHERE id=p_bill AND account_id=p_account;
 IF NOT FOUND OR a.active_bill_id<>p_bill OR b.content_hash<>p_hash OR a.review_hold IS NOT NULL THEN RAISE EXCEPTION 'Invoice needs review'; END IF;
 SELECT * INTO t FROM auction_bill_checkout_attempt WHERE account_id=p_account;
 IF FOUND THEN
  IF t.bill_id<>p_bill OR t.content_hash<>p_hash OR t.amount_cents<>p_amount THEN RAISE EXCEPTION 'Existing checkout needs reconciliation'; END IF;
  RETURN t;
 END IF;
 PERFORM 1 FROM auction_bill_payment_event p WHERE p.account_id=a.id AND p.kind='pending'
 AND NOT EXISTS(SELECT 1 FROM auction_bill_payment_event r WHERE r.original_event_id=p.id AND r.kind IN ('settlement','reject'));
 IF FOUND THEN RAISE EXCEPTION 'Pending payment requires reconciliation'; END IF;
 SELECT coalesce(sum(credit_cents),0) INTO credits FROM auction_bill_payment_event WHERE account_id=p_account;
 IF b.due_cents-credits<>p_amount OR p_amount<=0 THEN RAISE EXCEPTION 'Invoice amount changed'; END IF;
 INSERT INTO auction_bill_checkout_attempt(id,account_id,bill_id,content_hash,amount_cents) VALUES(p_attempt,p_account,p_bill,p_hash,p_amount) RETURNING * INTO t;
 RETURN t;
END $$;
CREATE OR REPLACE FUNCTION auction_credit_checkout(p_attempt text,p_capture text,p_amount integer,p_status text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE t auction_bill_checkout_attempt; a auction_bill_account; old auction_bill_payment_event; eid integer; event_kind text; credits integer;
BEGIN
 SELECT * INTO t FROM auction_bill_checkout_attempt WHERE id=p_attempt;
 IF NOT FOUND THEN RAISE EXCEPTION 'Checkout not found'; END IF;
 SELECT * INTO a FROM auction_bill_account WHERE id=t.account_id FOR UPDATE;
 SELECT * INTO t FROM auction_bill_checkout_attempt WHERE id=p_attempt FOR UPDATE;
 IF p_amount<>t.amount_cents OR p_status NOT IN ('completed','pending') OR t.order_id IS NULL THEN RAISE EXCEPTION 'Invalid verified capture'; END IF;
 IF t.payment_event_id IS NOT NULL THEN
  SELECT * INTO old FROM auction_bill_payment_event WHERE id=t.payment_event_id;
  IF old.transaction_ref<>p_capture THEN RAISE EXCEPTION 'Capture changed; review required'; END IF;
  IF old.kind='receipt' OR p_status='pending' THEN RETURN old.id; END IF;
  SELECT id INTO eid FROM auction_bill_payment_event WHERE original_event_id=old.id AND kind='settlement';
  IF FOUND THEN RETURN eid; END IF;
  eid:=auction_record_bill_event(a.user_id,a.id,'paypal-settle-'||t.id,'verified-settle-'||p_capture,'settlement','paypal',p_capture,p_amount,old.id,false,'Authenticated PayPal order capture verified');
 ELSE
  SELECT coalesce(sum(credit_cents),0) INTO credits FROM auction_bill_payment_event WHERE account_id=a.id;
  IF a.active_bill_id<>t.bill_id OR (SELECT due_cents FROM auction_bill_snapshot WHERE id=t.bill_id)-credits<>t.amount_cents THEN
   UPDATE auction_bill_account SET review_hold='Checkout amount or revision changed; payment reconciliation required' WHERE id=a.id;
  END IF;
  event_kind:=CASE WHEN p_status='completed' THEN 'receipt' ELSE 'pending' END;
  eid:=auction_record_bill_event(a.user_id,a.id,'paypal-capture-'||t.id,'verified-capture-'||p_capture,event_kind,'paypal',p_capture,p_amount,NULL,false,'Authenticated PayPal order capture verified');
 END IF;
 UPDATE auction_bill_checkout_attempt SET payment_event_id=coalesce(payment_event_id,eid),state=CASE WHEN p_status='completed' THEN 'captured' ELSE 'pending' END,updated_at=now() WHERE id=t.id;
 RETURN eid;
END $$;
COMMIT;
