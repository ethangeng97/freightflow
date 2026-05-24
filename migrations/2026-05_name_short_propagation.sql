-- Customers.name_short → shipments.supplier propagation
--
-- Background: container_items.supplier is a snapshot copied from shipments.supplier at insert
-- time. shipments.supplier was being set only by sync_shipment_supplier_from_customer on
-- shipments INSERT/UPDATE — so if a customer's name_short was filled in after shipments
-- existed, those shipments (and their container_items) kept stale NULLs.
--
-- This migration:
-- 1) Makes sync_shipment_supplier_from_customer deterministic (prefer partner_type='客户',
--    skip rows with empty name_short, tie-break by created_at — guards against historical
--    duplicate-name customers triggering LIMIT 1 to pick the empty row).
-- 2) Adds a propagation trigger so changes to customers.name_short cascade into shipments.

CREATE OR REPLACE FUNCTION public.sync_shipment_supplier_from_customer()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_short TEXT;
BEGIN
  IF NEW.customer IS NULL OR NEW.customer = '' THEN
    RETURN NEW;
  END IF;
  SELECT name_short INTO v_short
  FROM customers
  WHERE name = NEW.customer
    AND name_short IS NOT NULL AND name_short <> ''
  ORDER BY (partner_type = '客户') DESC, created_at ASC
  LIMIT 1;
  IF v_short IS NOT NULL AND v_short <> '' THEN
    NEW.supplier := v_short;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.propagate_name_short_to_shipments()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.name_short,'') IS DISTINCT FROM COALESCE(OLD.name_short,'')
     AND COALESCE(NEW.name_short,'') <> '' THEN
    UPDATE shipments
       SET supplier = NEW.name_short
     WHERE customer = NEW.name
       AND (supplier IS DISTINCT FROM NEW.name_short);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_propagate_name_short ON customers;
CREATE TRIGGER customers_propagate_name_short
AFTER UPDATE OF name_short ON customers
FOR EACH ROW
EXECUTE FUNCTION propagate_name_short_to_shipments();
