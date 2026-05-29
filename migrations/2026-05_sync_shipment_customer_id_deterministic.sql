-- 根因修复：sync_shipment_customer_id() 原本 `WHERE name=... LIMIT 1` 无排序，
-- 同名客户（如 KEPLIN 同时存在「客户」「海外代理」两条）会随机命中 customer_id。
-- 加 tiebreak：优先 partner_type='客户'，再按 created_at ASC，使解析确定化。
-- 与 sync_shipment_supplier_from_customer() 的选取逻辑一致。已应用到生产库。
CREATE OR REPLACE FUNCTION public.sync_shipment_customer_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_id UUID;
BEGIN
  IF NEW.customer IS NULL THEN
    NEW.customer_id := NULL;
  ELSE
    SELECT id INTO v_id
    FROM public.customers
    WHERE name = NEW.customer
    ORDER BY (partner_type = '客户') DESC, created_at ASC
    LIMIT 1;
    NEW.customer_id := v_id;
  END IF;
  RETURN NEW;
END;
$function$;
