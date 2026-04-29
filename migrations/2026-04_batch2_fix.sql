-- Fix 1: Create a view that joins user_profiles with auth.users to expose email
-- This view is owned by postgres (SECURITY DEFINER) so it can read auth.users
create or replace view public.user_profiles_view as
select
  up.*,
  u.email
from public.user_profiles up
join auth.users u on u.id = up.id;

-- Grant access to authenticated users
grant select on public.user_profiles_view to authenticated;

-- Fix 2: Allow customer role to see end_customers table (read-only)
drop policy if exists "end_customers_select" on public.end_customers;
create policy "end_customers_select" on public.end_customers
  for select using (
    current_setting('request.jwt.claims', true)::json->>'role' = 'authenticated'
  );
