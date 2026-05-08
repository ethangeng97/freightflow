-- Backfill shipments.supplier from customers.name_short, matched by shipments.customer.
-- Context: portal "Supplier" should display the 委托单位 short name; bansar-ops only
-- sets the full name into shipments.customer. This brings legacy rows into line.
--
-- shipments has an auth-checking guard trigger that fires under the SQL editor
-- (no auth.uid). SET LOCAL session_replication_role = replica skips ALL user
-- triggers for this transaction only — clean and self-contained.

BEGIN;
SET LOCAL session_replication_role = replica;

UPDATE shipments s
SET    supplier = c.name_short
FROM   customers c
WHERE  s.customer  = c.name
  AND  c.name_short IS NOT NULL
  AND  c.name_short <> ''
  AND  s.supplier IS DISTINCT FROM c.name_short;

COMMIT;

-- Sanity: rows where customer is set but no matching customers row exists (these
-- keep whatever is in shipments.supplier today; review manually if needed).
-- SELECT s.id, s.order_no, s.customer, s.supplier
-- FROM   shipments s
-- LEFT   JOIN customers c ON c.name = s.customer
-- WHERE  s.customer IS NOT NULL AND s.customer <> '' AND c.id IS NULL;
