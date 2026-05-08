-- Keep shipments.supplier in lockstep with customers.name_short.
-- Source of truth: customers.name_short (looked up by shipments.customer = customers.name).
-- Two triggers:
--   1) On shipments INSERT/UPDATE OF customer  → set NEW.supplier = matching name_short.
--   2) On customers UPDATE OF name_short        → propagate to all matching shipments.

-- ---------------------------------------------------------------------------
-- 1) Shipment-side: pull name_short whenever shipments.customer changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_shipment_supplier_from_customer()
RETURNS TRIGGER AS $$
DECLARE
  v_short TEXT;
BEGIN
  IF NEW.customer IS NULL OR NEW.customer = '' THEN
    -- No 委托单位 set; leave supplier alone (might be carrying legacy value).
    RETURN NEW;
  END IF;

  SELECT name_short INTO v_short
  FROM   customers
  WHERE  name = NEW.customer
  LIMIT  1;

  IF v_short IS NOT NULL AND v_short <> '' THEN
    NEW.supplier = v_short;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shipments_sync_supplier ON shipments;
CREATE TRIGGER shipments_sync_supplier
BEFORE INSERT OR UPDATE OF customer ON shipments
FOR EACH ROW
EXECUTE FUNCTION sync_shipment_supplier_from_customer();

-- ---------------------------------------------------------------------------
-- 2) Customer-side: when name_short is edited, fan out to existing shipments.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION propagate_customer_name_short()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name_short IS DISTINCT FROM OLD.name_short THEN
    UPDATE shipments
    SET    supplier = NEW.name_short
    WHERE  customer = NEW.name
      AND  (supplier IS DISTINCT FROM NEW.name_short);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_sync_short ON customers;
CREATE TRIGGER customers_sync_short
AFTER UPDATE OF name_short ON customers
FOR EACH ROW
EXECUTE FUNCTION propagate_customer_name_short();

-- ---------------------------------------------------------------------------
-- 3) Edge case: customer.name renamed → existing shipments.customer no longer
--    matches. We do NOT auto-rewrite shipments.customer here; that's a data
--    integrity concern outside this mapping. If you need it, run a manual
--    UPDATE shipments SET customer = NEW.name WHERE customer = OLD.name.
-- ---------------------------------------------------------------------------

-- After applying, run the one-shot backfill in 2026-05_supplier_short_name_backfill.sql
-- to catch any rows that pre-date these triggers.
