-- ═══════════════════════════════════════════════════════════════
-- portal 端访问现舱 spot_bookings 的 RLS
-- 规则：
--   · 内部角色 (admin/operator/sales/finance) → 看全部 (维持现有)
--   · portal 角色 (customer/supplier) → 只能看 partner_id = 自己 customer_id 的
--   · 关键: booking_agent_id / booking_agent_name 是 ops 内部字段,
--     portal 端不通过 RLS 屏蔽列, 用 view 屏蔽 (RLS 只能控行不能控列).
-- ═══════════════════════════════════════════════════════════════

-- 1) SELECT 策略：portal 只能看 partner_id 是自己 customer_id 的
DROP POLICY IF EXISTS sb_select ON public.spot_bookings;
CREATE POLICY sb_select ON public.spot_bookings FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'operator', 'sales', 'finance')
    OR (
      public.current_user_role() IN ('customer', 'supplier')
      AND partner_id IS NOT NULL
      AND partner_id = public.current_user_customer_id()
    )
  );

-- 2) 给 portal 用的 VIEW: 排除"订舱代理"两列 + 进价 + 进/卖价区间 + 备注
--    portal 端永远走这个 view, 不直接查 spot_bookings, 不会泄露 ops 内部字段
DROP VIEW IF EXISTS public.spot_bookings_portal;
CREATE VIEW public.spot_bookings_portal AS
SELECT
  id,
  carrier, vessel, voyage, route,
  pol, pod, etd, eta,
  container_size, container_type, total_qty,
  si_cutoff, vgm_cutoff, customs_cutoff, port_cutoff,
  booking_no, mbl_no,
  status,
  partner_id, partner_name,
  created_at
FROM public.spot_bookings;

-- view 自动继承底表 RLS（postgres 默认行为）, 所以行级隔离也跟着生效
GRANT SELECT ON public.spot_bookings_portal TO authenticated;
