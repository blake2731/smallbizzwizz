CREATE TABLE IF NOT EXISTS auction_bill_membership_review (
 user_id text NOT NULL,
 auction_id integer NOT NULL REFERENCES auction_session(id),
 buyer_id integer NOT NULL REFERENCES auction_buyer(id),
 membership_status text NOT NULL CHECK(membership_status IN ('member','nonmember')),
 evidence_note text NOT NULL CHECK(length(evidence_note)>=10),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,auction_id,buyer_id)
);
