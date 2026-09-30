-- Run with psql and ON_ERROR_STOP enabled. Only temporary tables are used.
-- Mirrors the ownership queries in getAuctionState; real auction rows are untouched.
BEGIN;
SET LOCAL statement_timeout = '15s';
CREATE TEMP TABLE test_auction_buyer(id integer PRIMARY KEY, auction_id integer) ON COMMIT DROP;
CREATE TEMP TABLE test_auction_package(id integer PRIMARY KEY, buyer_id integer, package_number integer) ON COMMIT DROP;
CREATE TEMP TABLE test_auction_item(id integer PRIMARY KEY, auction_id integer, buyer_id integer, status text, package_id integer, price_cents integer) ON COMMIT DROP;
INSERT INTO test_auction_buyer VALUES (10,1),(20,1),(30,1),(40,2);
INSERT INTO test_auction_package VALUES (101,10,1),(201,20,1),(202,20,2),(301,30,1),(401,40,1);
INSERT INTO test_auction_item VALUES
  (1,1,10,'open',301,500),
  (2,1,10,'sold',301,600),
  (3,1,20,'sold',301,700),
  (4,1,20,'sold',202,800),
  (5,1,10,'unsold',101,900),
  (6,1,10,'void',101,1000),
  (7,1,NULL,'sold',101,1100),
  (8,2,40,'sold',401,1200),
  (9,1,30,'sold',999,1300),
  (10,1,10,'sold',NULL,1400),
  (11,1,40,'sold',401,1500);
UPDATE test_auction_item i
SET package_id = NULL
WHERE i.auction_id = 1 AND i.package_id IS NOT NULL
  AND (i.status <> 'sold' OR i.buyer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM test_auction_package p JOIN test_auction_buyer b ON b.id=p.buyer_id
    WHERE p.id=i.package_id AND p.buyer_id=i.buyer_id AND b.auction_id=i.auction_id
  ));
UPDATE test_auction_item i
SET package_id = p.id
FROM test_auction_package p
WHERE i.auction_id=1 AND i.status='sold' AND i.buyer_id=p.buyer_id
  AND p.package_number=1 AND i.package_id IS NULL
  AND EXISTS (SELECT 1 FROM test_auction_buyer b WHERE b.id=i.buyer_id AND b.auction_id=i.auction_id)
  AND NOT EXISTS (SELECT 1 FROM test_auction_package p2 WHERE p2.buyer_id=p.buyer_id AND p2.id<>p.id);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM test_auction_item i JOIN
    (VALUES (1,NULL::integer),(2,101),(3,NULL),(4,202),(5,NULL),(6,NULL),
            (7,NULL),(8,401),(9,301),(10,101),(11,NULL)) expected(id,package_id) USING(id)
    WHERE i.package_id IS DISTINCT FROM expected.package_id
  ) THEN RAISE EXCEPTION 'Package ownership regression'; END IF;
  IF (SELECT sum(price_cents) FROM test_auction_item)<>11000
    THEN RAISE EXCEPTION 'Prices changed'; END IF;
END $$;
SELECT 'PASS: 11 package ownership cases' AS result;
ROLLBACK;
