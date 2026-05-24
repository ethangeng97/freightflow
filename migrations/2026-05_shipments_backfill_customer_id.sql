-- shipments.customer_id 之前全空，导致 supplier RLS 完全查不到自己的订单
-- 1) 一次性回填：按 shipments.customer 文本匹配 customers.name
-- 2) 加 trigger：以后 customer 文本变了 customer_id 自动同步

-- shipments_field_guard trigger 在没有 auth 上下文时会 RAISE，绕过它
SET session_replication_role = replica;
UPDATE public.shipments s
SET customer_id = c.id
FROM public.customers c
WHERE s.customer = c.name
  AND s.customer_id IS NULL;
SET session_replication_role = origin;

-- trigger：insert/update shipments.customer 时自动设置 customer_id
CREATE OR REPLACE FUNCTION sync_shipment_customer_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $body$
DECLARE v_id UUID;
BEGIN
  IF NEW.customer IS NULL THEN
    NEW.customer_id := NULL;
  ELSE
    SELECT id INTO v_id FROM public.customers WHERE name = NEW.customer LIMIT 1;
    NEW.customer_id := v_id;
  END IF;
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS shipments_sync_customer_id ON public.shipments;
CREATE TRIGGER shipments_sync_customer_id
BEFORE INSERT OR UPDATE OF customer ON public.shipments
FOR EACH ROW EXECUTE FUNCTION sync_shipment_customer_id();
