-- supplier 限制：只能看自己绑定的 customers 行；其他 customers/suppliers/end_customers/overseas_agents 一律屏蔽

DROP POLICY IF EXISTS restrict_customers_supplier ON public.customers;
CREATE POLICY restrict_customers_supplier ON public.customers
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() != 'supplier'
    OR id = public.current_user_customer_id()
  );

DROP POLICY IF EXISTS restrict_suppliers_supplier ON public.suppliers;
CREATE POLICY restrict_suppliers_supplier ON public.suppliers
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.current_user_role() != 'supplier');

DROP POLICY IF EXISTS restrict_end_customers_supplier ON public.end_customers;
CREATE POLICY restrict_end_customers_supplier ON public.end_customers
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.current_user_role() != 'supplier');

DROP POLICY IF EXISTS restrict_overseas_agents_supplier ON public.overseas_agents;
CREATE POLICY restrict_overseas_agents_supplier ON public.overseas_agents
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.current_user_role() != 'supplier');
