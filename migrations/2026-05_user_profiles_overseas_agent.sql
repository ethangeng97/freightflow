-- ============================================================
-- 扩展 user_profiles 支持 overseas_agent 角色 + 绑定
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS overseas_agent_id UUID REFERENCES public.overseas_agents(id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_overseas_agent_id
  ON public.user_profiles(overseas_agent_id);

-- 重建 role check 加入 overseas_agent
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_role_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_role_check;
  END IF;
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_role_check
    CHECK (role IN ('admin','operator','sales','customer','supplier','finance','overseas_agent'));
END $do$;

-- helper：当前用户绑定的 overseas_agent_id
CREATE OR REPLACE FUNCTION public.current_user_overseas_agent_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $body$
  SELECT overseas_agent_id FROM public.user_profiles WHERE id = auth.uid()
$body$;

-- ============================================================
-- 管理员账号管理用：列出所有用户（关联 auth.users 和绑定的客户/海外代理）
-- 只有 admin 能调用；其它角色 RAISE EXCEPTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  name TEXT,
  customer_id UUID,
  customer_name TEXT,
  overseas_agent_id UUID,
  overseas_agent_name TEXT,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'access denied: admin only';
  END IF;

  RETURN QUERY
    SELECT
      up.id,
      au.email::text,
      up.role,
      up.name,
      up.customer_id,
      c.name AS customer_name,
      up.overseas_agent_id,
      oa.name AS overseas_agent_name,
      au.last_sign_in_at,
      au.created_at
    FROM public.user_profiles up
    JOIN auth.users au ON au.id = up.id
    LEFT JOIN public.customers c        ON c.id  = up.customer_id
    LEFT JOIN public.overseas_agents oa ON oa.id = up.overseas_agent_id
    ORDER BY au.created_at DESC;
END;
$body$;

-- 让任何已登录用户能调用这个函数（admin 检查在函数体内）
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
