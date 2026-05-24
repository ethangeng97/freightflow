-- supplier 可读自己（partner_id = 自己绑定的 customer_id）的应收 charges 和 invoices
-- 用 RESTRICTIVE 策略加在现有策略之上：
--   * supplier 角色 → 必须 partner_id = current_user_customer_id() AND direction = '应收'
--   * 其它角色 → 不受影响

ALTER TABLE public.charges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 允许 supplier 读自己的（PERMISSIVE，附加在现有策略上）
DROP POLICY IF EXISTS supplier_read_own_charges ON public.charges;
CREATE POLICY supplier_read_own_charges ON public.charges
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'supplier'
    AND partner_id = public.current_user_customer_id()
    AND direction = '应收'
  );

DROP POLICY IF EXISTS supplier_read_own_invoices ON public.invoices;
CREATE POLICY supplier_read_own_invoices ON public.invoices
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'supplier'
    AND partner_id = public.current_user_customer_id()
  );

-- 给内部员工保证全读（避免开 RLS 后内部读不到）
DROP POLICY IF EXISTS internal_read_charges ON public.charges;
CREATE POLICY internal_read_charges ON public.charges
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','operator','sales','finance'));

DROP POLICY IF EXISTS internal_rw_charges ON public.charges;
CREATE POLICY internal_rw_charges ON public.charges
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operator','sales','finance'))
  WITH CHECK (public.current_user_role() IN ('admin','operator','sales','finance'));

DROP POLICY IF EXISTS internal_read_invoices ON public.invoices;
CREATE POLICY internal_read_invoices ON public.invoices
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','operator','sales','finance'));

DROP POLICY IF EXISTS internal_rw_invoices ON public.invoices;
CREATE POLICY internal_rw_invoices ON public.invoices
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','operator','sales','finance'))
  WITH CHECK (public.current_user_role() IN ('admin','operator','sales','finance'));
