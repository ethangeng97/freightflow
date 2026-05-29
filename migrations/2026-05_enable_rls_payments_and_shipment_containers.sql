-- 修复存量隐患：payments 与 shipment_containers 此前未启用 RLS（anon/外部可经 API 读取，
-- payments 还含 bank_account 敏感列）。本迁移启用 RLS 并配齐 policy。
-- 策略贴合现状：内部角色保持全权；portal 合法读取保留；anon/外部挡掉。
-- 已直接应用到生产库。幂等，可重跑。

-- ============ payments：内部财务表，portal 不读（portal 用的是 payment_vouchers）============
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;

DROP POLICY IF EXISTS payments_internal_all ON public.payments;
CREATE POLICY payments_internal_all ON public.payments
  FOR ALL TO authenticated
  USING      (public.current_user_role() IN ('admin','operator','finance','sales'))
  WITH CHECK (public.current_user_role() IN ('admin','operator','finance','sales'));

-- ============ shipment_containers：镜像 cargo_items 可见性 + 海外代理 ============
ALTER TABLE public.shipment_containers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_containers TO authenticated;

-- 读：能看父票(内部/客户/工厂经 can_see_shipment) 或 海外代理当票
DROP POLICY IF EXISTS sc_select ON public.shipment_containers;
CREATE POLICY sc_select ON public.shipment_containers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.id = shipment_id
      AND (public.can_see_shipment(s.customer, s.customer_id)
           OR s.overseas_agent = public.current_user_overseas_agent_name())
  ));

-- 写：仅内部角色（OPS 录单/导入）
DROP POLICY IF EXISTS sc_insert ON public.shipment_containers;
CREATE POLICY sc_insert ON public.shipment_containers FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','operator','sales'));

DROP POLICY IF EXISTS sc_update ON public.shipment_containers;
CREATE POLICY sc_update ON public.shipment_containers FOR UPDATE TO authenticated
  USING      (public.current_user_role() IN ('admin','operator','sales'))
  WITH CHECK (public.current_user_role() IN ('admin','operator','sales'));

DROP POLICY IF EXISTS sc_delete ON public.shipment_containers;
CREATE POLICY sc_delete ON public.shipment_containers FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('admin','operator'));
