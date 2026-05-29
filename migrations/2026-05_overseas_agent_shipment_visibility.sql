-- 海外代理 portal 可见性（加法式，不改 can_see_shipment）
-- 海外代理(role=overseas_agent + overseas_agent_id 绑定)只能看
--   shipments.overseas_agent = 自己绑定的 overseas_agents.name 的票
-- 已直接应用到生产库（手动迁移约定）。幂等，可重跑。

-- helper: 返回当前登录用户绑定的海外代理名（仅 role=overseas_agent 且已绑定时非空）
CREATE OR REPLACE FUNCTION public.current_user_overseas_agent_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT oa.name
  FROM public.user_profiles up
  JOIN public.overseas_agents oa ON oa.id = up.overseas_agent_id
  WHERE up.id = auth.uid() AND up.role = 'overseas_agent'
$$;

-- shipments：海外代理可见自己代理的票
DROP POLICY IF EXISTS oa_select_shipments ON public.shipments;
CREATE POLICY oa_select_shipments ON public.shipments FOR SELECT TO authenticated
  USING (overseas_agent IS NOT NULL
         AND overseas_agent = public.current_user_overseas_agent_name());

-- cargo_items：跟父票一致
DROP POLICY IF EXISTS oa_select_cargo_items ON public.cargo_items;
CREATE POLICY oa_select_cargo_items ON public.cargo_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shipments s
                 WHERE s.id = shipment_id
                   AND s.overseas_agent = public.current_user_overseas_agent_name()));

-- shipment_attachments：跟父票一致
DROP POLICY IF EXISTS oa_select_shipment_attachments ON public.shipment_attachments;
CREATE POLICY oa_select_shipment_attachments ON public.shipment_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shipments s
                 WHERE s.id = shipment_id
                   AND s.overseas_agent = public.current_user_overseas_agent_name()));

-- 注意：shipment_containers 当前 RLS 未启用（全表可读，存量问题），
-- 故未在此加海外代理 policy（加了也不生效，且触发 policy_exists_rls_disabled）。
-- 待该表正式启用 RLS 并配齐各角色 policy 时，再补：
--   CREATE POLICY oa_select_shipment_containers ON public.shipment_containers FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM public.shipments s
--                    WHERE s.id = shipment_id
--                      AND s.overseas_agent = public.current_user_overseas_agent_name()));

-- 数据清洗：拼写变体归一
UPDATE public.shipments SET overseas_agent = 'KEPLIN GROUP LIMITED'
  WHERE overseas_agent = 'Keplin';
