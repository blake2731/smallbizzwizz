-- Review migration. Apply only to an isolated database first; no live execution in this task.
BEGIN;
ALTER TABLE auction_customer_profile ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE auction_customer_profile ADD COLUMN IF NOT EXISTS creation_key text;
ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS customer_profile_id integer REFERENCES auction_customer_profile(id);

-- Preserve every existing profile ID and all contact/address values. Never merge profiles.
DROP INDEX IF EXISTS auction_customer_profile_user_name_unique;
CREATE INDEX IF NOT EXISTS auction_customer_profile_user_name_idx ON auction_customer_profile(user_id, normalized_name);
CREATE UNIQUE INDEX IF NOT EXISTS auction_customer_profile_creation_unique ON auction_customer_profile(user_id, creation_key);

-- Link only unambiguous legacy name matches. If duplicate profiles already exist, each
-- unresolved auction buyer gets a separate profile retaining its own email. No guess.
UPDATE auction_buyer b SET customer_profile_id = p.id
FROM auction_session s, auction_customer_profile p
WHERE b.auction_id = s.id AND b.customer_profile_id IS NULL
  AND p.user_id = s.user_id AND p.normalized_name = b.normalized_name
  AND (b.email IS NULL OR p.email IS NULL OR lower(b.email) = lower(p.email))
  AND (SELECT count(*) FROM auction_buyer b2 WHERE b2.auction_id = b.auction_id AND b2.normalized_name = b.normalized_name) = 1
  AND (SELECT count(*) FROM auction_customer_profile p2 WHERE p2.user_id = s.user_id AND p2.normalized_name = b.normalized_name) = 1;

INSERT INTO auction_customer_profile(user_id, normalized_name, display_name, email, shopify_customer_id, creation_key)
SELECT s.user_id, b.normalized_name, b.display_name, b.email, b.shopify_customer_id, 'legacy-buyer-' || b.id
FROM auction_buyer b JOIN auction_session s ON s.id = b.auction_id
WHERE b.customer_profile_id IS NULL
ON CONFLICT (user_id, creation_key) DO NOTHING;

UPDATE auction_buyer b SET customer_profile_id = p.id
FROM auction_session s, auction_customer_profile p
WHERE b.auction_id = s.id AND b.customer_profile_id IS NULL
  AND p.user_id = s.user_id AND p.creation_key = 'legacy-buyer-' || b.id;

DROP INDEX IF EXISTS auction_buyer_auction_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS auction_buyer_auction_customer_unique ON auction_buyer(auction_id, customer_profile_id);
COMMIT;
