-- ============================================================================
-- FreightFlow / Fobcargo  —  Batch 2 migration
-- Run this entire file in Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Helpers
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ----------------------------------------------------------------------------
-- 1. user_profiles  (extend or create)
-- Role values: admin | sales | operator | customer
-- ----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  role        text not null default 'operator',
  full_name   text,
  customer_id uuid,         -- only set when role='customer'; FK added below
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.user_profiles add column if not exists customer_id uuid;
alter table public.user_profiles add column if not exists active boolean not null default true;
alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists updated_at timestamptz not null default now();

-- Constrain role values
do $$ begin
  alter table public.user_profiles
    drop constraint if exists user_profiles_role_check;
  alter table public.user_profiles
    add constraint user_profiles_role_check check (role in ('admin','sales','operator','customer'));
end $$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on new auth user
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, email, role)
  values (new.id, new.email, 'operator')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. customers — extend
-- ----------------------------------------------------------------------------
alter table public.customers add column if not exists id uuid default gen_random_uuid();
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema='public' and table_name='customers' and constraint_type='PRIMARY KEY'
  ) then
    alter table public.customers add primary key (id);
  end if;
end $$;
alter table public.customers add column if not exists pipeline_stage_id uuid;
alter table public.customers add column if not exists contact_name      text;
alter table public.customers add column if not exists contact_email     text;
alter table public.customers add column if not exists contact_phone     text;
alter table public.customers add column if not exists country           text;
alter table public.customers add column if not exists company_size      text;
alter table public.customers add column if not exists website           text;
alter table public.customers add column if not exists source            text;
alter table public.customers add column if not exists tags              text[];
alter table public.customers add column if not exists created_at        timestamptz not null default now();
alter table public.customers add column if not exists updated_at        timestamptz not null default now();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- FK: user_profiles.customer_id -> customers.id
do $$ begin
  alter table public.user_profiles
    drop constraint if exists user_profiles_customer_id_fkey;
  alter table public.user_profiles
    add constraint user_profiles_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null;
end $$;

-- ----------------------------------------------------------------------------
-- 3. sales_customers  (m:n)
-- ----------------------------------------------------------------------------
create table if not exists public.sales_customers (
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  customer_id uuid not null references public.customers(id)     on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, customer_id)
);
create index if not exists idx_sales_customers_user     on public.sales_customers(user_id);
create index if not exists idx_sales_customers_customer on public.sales_customers(customer_id);

-- ----------------------------------------------------------------------------
-- 4. pipeline_stages  (custom CRUD; sortable)
-- ----------------------------------------------------------------------------
create table if not exists public.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text default '#94a3b8',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Seed defaults if table is empty
insert into public.pipeline_stages (name, color, sort_order)
select * from (values
  ('Lead',      '#94a3b8', 10),
  ('Contacted', '#0ea5e9', 20),
  ('Quoted',    '#f59e0b', 30),
  ('Won',       '#10b981', 40),
  ('Lost',      '#ef4444', 50)
) as s(name, color, sort_order)
where not exists (select 1 from public.pipeline_stages);

-- FK from customers.pipeline_stage_id
do $$ begin
  alter table public.customers
    drop constraint if exists customers_pipeline_stage_id_fkey;
  alter table public.customers
    add constraint customers_pipeline_stage_id_fkey
    foreign key (pipeline_stage_id) references public.pipeline_stages(id) on delete set null;
end $$;

-- ----------------------------------------------------------------------------
-- 5. customer_followups
-- ----------------------------------------------------------------------------
create table if not exists public.customer_followups (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  user_id      uuid references public.user_profiles(id) on delete set null,
  user_email   text,
  type         text not null default 'note',          -- note | call | email | meeting
  subject      text,
  body         text,
  next_action  text,
  next_date    date,
  created_at   timestamptz not null default now()
);
create index if not exists idx_followups_customer on public.customer_followups(customer_id, created_at desc);
create index if not exists idx_followups_next     on public.customer_followups(next_date) where next_date is not null;

-- ----------------------------------------------------------------------------
-- 6. quotes + quote_items
-- ----------------------------------------------------------------------------
create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  quote_no      text,
  status        text not null default 'draft',    -- draft | sent | accepted | rejected | expired
  pol           text, pod text,
  incoterms     text,
  carrier       text,
  total         numeric(14,2) default 0,
  currency      text default 'USD',
  valid_until   date,
  notes         text,
  created_by    uuid references public.user_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_quotes_updated_at on public.quotes;
create trigger trg_quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();
create index if not exists idx_quotes_customer on public.quotes(customer_id, created_at desc);

create table if not exists public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  qty         numeric(14,4) default 1,
  unit        text,
  unit_price  numeric(14,4) default 0,
  amount      numeric(14,2) generated always as (round(coalesce(qty,0)*coalesce(unit_price,0), 2)) stored,
  sort_order  integer not null default 0
);
create index if not exists idx_quote_items_quote on public.quote_items(quote_id, sort_order);

-- ----------------------------------------------------------------------------
-- 7. notes  (knowledge base: customer / supplier / shipment)
-- ----------------------------------------------------------------------------
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('customer','supplier','shipment')),
  entity_id    uuid not null,
  title        text,
  body         text,
  tags         text[] default '{}',
  pinned       boolean not null default false,
  created_by   uuid references public.user_profiles(id) on delete set null,
  user_email   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
create index if not exists idx_notes_entity on public.notes(entity_type, entity_id, created_at desc);
create index if not exists idx_notes_pinned on public.notes(pinned) where pinned = true;

-- ----------------------------------------------------------------------------
-- 8. column_preferences  (per-user, per-table column visibility & order)
-- ----------------------------------------------------------------------------
create table if not exists public.column_preferences (
  user_id    uuid not null references public.user_profiles(id) on delete cascade,
  table_key  text not null,
  config     jsonb not null,                  -- [{key, visible, order}]
  updated_at timestamptz not null default now(),
  primary key (user_id, table_key)
);
drop trigger if exists trg_colpref_updated_at on public.column_preferences;
create trigger trg_colpref_updated_at before update on public.column_preferences
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 9. shipments — ensure id type is uuid PK & supplier_id (we add only what's missing)
-- ----------------------------------------------------------------------------
alter table public.shipments add column if not exists supplier_id uuid;
alter table public.shipments add column if not exists customer_id uuid;
do $$ begin
  alter table public.shipments
    drop constraint if exists shipments_customer_id_fkey;
  alter table public.shipments
    add constraint shipments_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null;
end $$;

-- ============================================================================
-- 10. RLS POLICIES
-- ============================================================================
-- helper: current role
create or replace function public.current_role() returns text
  language sql stable security definer as $$
    select role from public.user_profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer as $$
    select coalesce((select role from public.user_profiles where id = auth.uid()) = 'admin', false)
$$;

-- helper: customers visible to the current user (returns set of customer_ids)
create or replace function public.my_customer_ids() returns setof uuid
  language sql stable security definer as $$
    select case
      when (select role from public.user_profiles where id = auth.uid()) = 'admin'    then c.id
      when (select role from public.user_profiles where id = auth.uid()) = 'operator' then c.id
      when (select role from public.user_profiles where id = auth.uid()) = 'sales'
           then (select sc.customer_id from public.sales_customers sc where sc.user_id = auth.uid() and sc.customer_id = c.id)
      when (select role from public.user_profiles where id = auth.uid()) = 'customer'
           then (select up.customer_id from public.user_profiles up where up.id = auth.uid() and up.customer_id = c.id)
    end
    from public.customers c
$$;

-- helper: shipment is visible to me
create or replace function public.can_see_shipment(s_customer text, s_customer_id uuid) returns boolean
  language plpgsql stable security definer as $$
declare
  r text;
  uid uuid := auth.uid();
  my_cid uuid;
begin
  select role into r from public.user_profiles where id = uid;
  if r is null then return false; end if;
  if r in ('admin','operator') then return true; end if;
  if r = 'sales' then
    return exists (
      select 1 from public.sales_customers sc
      join public.customers c on c.id = sc.customer_id
      where sc.user_id = uid and (sc.customer_id = s_customer_id or c.name = s_customer)
    );
  end if;
  if r = 'customer' then
    select customer_id into my_cid from public.user_profiles where id = uid;
    if my_cid is null then return false; end if;
    return s_customer_id = my_cid or exists (
      select 1 from public.customers c where c.id = my_cid and c.name = s_customer
    );
  end if;
  return false;
end $$;

-- ----------------------------------------------------------------------------
-- Enable RLS
-- ----------------------------------------------------------------------------
alter table public.user_profiles      enable row level security;
alter table public.shipments          enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.loading_details    enable row level security;
alter table public.suppliers          enable row level security;
alter table public.customers          enable row level security;
alter table public.end_customers      enable row level security;
alter table public.carriers           enable row level security;
alter table public.ports              enable row level security;
alter table public.sales_customers    enable row level security;
alter table public.pipeline_stages    enable row level security;
alter table public.customer_followups enable row level security;
alter table public.quotes             enable row level security;
alter table public.quote_items        enable row level security;
alter table public.notes              enable row level security;
alter table public.column_preferences enable row level security;

-- ----------------------------------------------------------------------------
-- user_profiles: each user reads own; admin reads/writes all; user updates own profile (limited fields enforced client-side)
-- ----------------------------------------------------------------------------
drop policy if exists up_select_self_or_admin on public.user_profiles;
create policy up_select_self_or_admin on public.user_profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists up_update_self_or_admin on public.user_profiles;
create policy up_update_self_or_admin on public.user_profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists up_admin_insert on public.user_profiles;
create policy up_admin_insert on public.user_profiles for insert
  with check (public.is_admin() or id = auth.uid());

drop policy if exists up_admin_delete on public.user_profiles;
create policy up_admin_delete on public.user_profiles for delete
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- shipments
--   admin/operator: all rows
--   sales: rows where customer/customer_id is in their assigned set
--   customer: rows matching their linked customer_id (or customer name match)
-- WRITE:
--   admin: all fields
--   operator: all fields except qc_status (enforced via WITH CHECK trigger)
--   sales: same as operator on rows they can see
--   customer: only qc_status (trigger)
-- ----------------------------------------------------------------------------
drop policy if exists shp_select on public.shipments;
create policy shp_select on public.shipments for select
  using (public.can_see_shipment(customer, customer_id));

drop policy if exists shp_insert on public.shipments;
create policy shp_insert on public.shipments for insert
  with check (public.current_role() in ('admin','operator','sales'));

drop policy if exists shp_update on public.shipments;
create policy shp_update on public.shipments for update
  using (public.can_see_shipment(customer, customer_id))
  with check (public.can_see_shipment(customer, customer_id));

drop policy if exists shp_delete on public.shipments;
create policy shp_delete on public.shipments for delete
  using (public.is_admin());

-- Field-level write enforcement via trigger
create or replace function public.shipments_field_guard() returns trigger
  language plpgsql security definer as $$
declare r text;
begin
  select role into r from public.user_profiles where id = auth.uid();
  if r is null then raise exception 'no profile'; end if;
  if r = 'admin' then return new; end if;

  if tg_op = 'INSERT' then
    if r = 'customer' then raise exception 'customer cannot create shipments'; end if;
    -- operator/sales: forbid setting qc_status on insert (must be null/default)
    if r in ('operator','sales') and new.qc_status is distinct from null then
      new.qc_status := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- customer is handled in shipments_customer_qc_only trigger; here we only
    -- block operator/sales from changing qc_status.
    if r in ('operator','sales') and (new.qc_status is distinct from old.qc_status) then
      raise exception 'role % cannot update qc_status', r;
    end if;
    return new;
  end if;
  return new;
end $$;

-- The customer-only-qc-status path needs a cleaner approach: do it as separate trigger
create or replace function public.shipments_customer_qc_only() returns trigger
  language plpgsql security definer as $$
declare r text; allowed_new text;
begin
  select role into r from public.user_profiles where id = auth.uid();
  if r <> 'customer' then return new; end if;
  if tg_op <> 'UPDATE' then return new; end if;
  allowed_new := new.qc_status;
  new := old;
  new.qc_status := allowed_new;
  return new;
end $$;

drop trigger if exists trg_shp_field_guard on public.shipments;
create trigger trg_shp_field_guard before insert or update on public.shipments
  for each row execute function public.shipments_field_guard();

drop trigger if exists trg_shp_customer_qc on public.shipments;
create trigger trg_shp_customer_qc before update on public.shipments
  for each row execute function public.shipments_customer_qc_only();

-- ----------------------------------------------------------------------------
-- audit_logs: anyone authenticated can insert their own; only admin can read all; user can read logs of shipments they can see
-- ----------------------------------------------------------------------------
drop policy if exists al_insert on public.audit_logs;
create policy al_insert on public.audit_logs for insert with check (auth.uid() is not null);

drop policy if exists al_select on public.audit_logs;
create policy al_select on public.audit_logs for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.shipments s
      where s.id = audit_logs.shipment_id
        and public.can_see_shipment(s.customer, s.customer_id)
    )
  );

drop policy if exists al_delete on public.audit_logs;
create policy al_delete on public.audit_logs for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- loading_details: same visibility as parent shipment; admin/operator/sales write
-- ----------------------------------------------------------------------------
drop policy if exists ld_select on public.loading_details;
create policy ld_select on public.loading_details for select
  using (exists (
    select 1 from public.shipments s where s.id = loading_details.shipment_id
      and public.can_see_shipment(s.customer, s.customer_id)
  ));

drop policy if exists ld_modify on public.loading_details;
create policy ld_modify on public.loading_details for all
  using (
    public.current_role() in ('admin','operator','sales')
    and exists (select 1 from public.shipments s where s.id = loading_details.shipment_id
                and public.can_see_shipment(s.customer, s.customer_id))
  )
  with check (
    public.current_role() in ('admin','operator','sales')
    and exists (select 1 from public.shipments s where s.id = loading_details.shipment_id
                and public.can_see_shipment(s.customer, s.customer_id))
  );

-- ----------------------------------------------------------------------------
-- Reference data (suppliers, customers, end_customers, carriers, ports)
--   Read: all authenticated
--   Write: admin only (operator can also manage carriers/ports/suppliers)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array['suppliers','customers','end_customers','carriers','ports']) loop
    execute format('drop policy if exists %I on public.%I',  t||'_read',   t);
    execute format('drop policy if exists %I on public.%I',  t||'_admin',  t);
    execute format('create policy %I on public.%I for select using (auth.uid() is not null)', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.current_role() in (''admin'',''operator'')) with check (public.current_role() in (''admin'',''operator''))', t||'_admin', t);
  end loop;
end $$;

-- end_customers: hide from sales+customer (operator OK to see)
drop policy if exists end_customers_read on public.end_customers;
create policy end_customers_read on public.end_customers for select
  using (public.current_role() in ('admin','operator'));

-- customer self-read: customer role can read its own customer record
drop policy if exists customers_self_read on public.customers;
create policy customers_self_read on public.customers for select
  using (
    auth.uid() is not null and (
      public.current_role() in ('admin','operator')
      or (public.current_role() = 'sales'   and exists (select 1 from public.sales_customers sc where sc.user_id=auth.uid() and sc.customer_id=customers.id))
      or (public.current_role() = 'customer' and exists (select 1 from public.user_profiles up where up.id=auth.uid() and up.customer_id=customers.id))
    )
  );
-- Override the generic read policy for customers (drop the generic one created above)
drop policy if exists customers_read on public.customers;

-- ----------------------------------------------------------------------------
-- sales_customers: admin manages; user can read their own row
-- ----------------------------------------------------------------------------
drop policy if exists sc_admin on public.sales_customers;
create policy sc_admin on public.sales_customers for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists sc_self_read on public.sales_customers;
create policy sc_self_read on public.sales_customers for select using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- pipeline_stages: read all auth; admin writes
-- ----------------------------------------------------------------------------
drop policy if exists ps_read on public.pipeline_stages;
create policy ps_read on public.pipeline_stages for select using (auth.uid() is not null);
drop policy if exists ps_admin on public.pipeline_stages;
create policy ps_admin on public.pipeline_stages for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- customer_followups: visible if customer is visible; sales/admin/operator write
-- ----------------------------------------------------------------------------
drop policy if exists fu_select on public.customer_followups;
create policy fu_select on public.customer_followups for select
  using (
    public.is_admin()
    or (public.current_role() = 'operator')
    or (public.current_role() = 'sales' and exists (select 1 from public.sales_customers sc where sc.user_id=auth.uid() and sc.customer_id=customer_followups.customer_id))
  );
drop policy if exists fu_modify on public.customer_followups;
create policy fu_modify on public.customer_followups for all
  using (
    public.current_role() in ('admin','operator')
    or (public.current_role() = 'sales' and exists (select 1 from public.sales_customers sc where sc.user_id=auth.uid() and sc.customer_id=customer_followups.customer_id))
  )
  with check (
    public.current_role() in ('admin','operator')
    or (public.current_role() = 'sales' and exists (select 1 from public.sales_customers sc where sc.user_id=auth.uid() and sc.customer_id=customer_followups.customer_id))
  );

-- ----------------------------------------------------------------------------
-- quotes: same visibility model as followups
-- ----------------------------------------------------------------------------
drop policy if exists q_select on public.quotes;
create policy q_select on public.quotes for select
  using (
    public.is_admin()
    or public.current_role() = 'operator'
    or (public.current_role() = 'sales' and exists (select 1 from public.sales_customers sc where sc.user_id=auth.uid() and sc.customer_id=quotes.customer_id))
    or (public.current_role() = 'customer' and exists (select 1 from public.user_profiles up where up.id=auth.uid() and up.customer_id=quotes.customer_id))
  );
drop policy if exists q_modify on public.quotes;
create policy q_modify on public.quotes for all
  using (
    public.current_role() in ('admin','operator')
    or (public.current_role() = 'sales' and exists (select 1 from public.sales_customers sc where sc.user_id=auth.uid() and sc.customer_id=quotes.customer_id))
  )
  with check (
    public.current_role() in ('admin','operator')
    or (public.current_role() = 'sales' and exists (select 1 from public.sales_customers sc where sc.user_id=auth.uid() and sc.customer_id=quotes.customer_id))
  );

drop policy if exists qi_select on public.quote_items;
create policy qi_select on public.quote_items for select
  using (exists (select 1 from public.quotes q where q.id=quote_items.quote_id));
drop policy if exists qi_modify on public.quote_items;
create policy qi_modify on public.quote_items for all
  using (exists (select 1 from public.quotes q where q.id=quote_items.quote_id))
  with check (exists (select 1 from public.quotes q where q.id=quote_items.quote_id));

-- ----------------------------------------------------------------------------
-- notes: visibility per entity
-- ----------------------------------------------------------------------------
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select
  using (
    public.is_admin()
    or public.current_role() = 'operator'
    or (
      entity_type = 'customer' and (
        (public.current_role() = 'sales' and exists (select 1 from public.sales_customers sc where sc.user_id=auth.uid() and sc.customer_id=notes.entity_id))
        or (public.current_role() = 'customer' and exists (select 1 from public.user_profiles up where up.id=auth.uid() and up.customer_id=notes.entity_id))
      )
    )
    or (
      entity_type = 'shipment' and exists (
        select 1 from public.shipments s where s.id=notes.entity_id
          and public.can_see_shipment(s.customer, s.customer_id)
      )
    )
    or (entity_type = 'supplier' and public.current_role() in ('admin','operator','sales'))
  );
drop policy if exists notes_modify on public.notes;
create policy notes_modify on public.notes for all
  using (public.current_role() in ('admin','operator','sales'))
  with check (public.current_role() in ('admin','operator','sales'));

-- ----------------------------------------------------------------------------
-- column_preferences: each user owns their row
-- ----------------------------------------------------------------------------
drop policy if exists cp_self on public.column_preferences;
create policy cp_self on public.column_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- 11. Grants — supabase service handles roles, but ensure authenticated can use functions
-- ============================================================================
grant execute on function public.current_role()              to anon, authenticated;
grant execute on function public.is_admin()                  to anon, authenticated;
grant execute on function public.can_see_shipment(text,uuid) to anon, authenticated;

-- ============================================================================
-- DONE
-- ============================================================================
