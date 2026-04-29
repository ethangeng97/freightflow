-- ==========================================================================
-- Containers & Container Items — Option C data model
-- ==========================================================================

-- Business types for containers (user-defined via Manage page)
create table if not exists public.container_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Seed default types
insert into public.container_types (name, sort_order) values
  ('FCL', 1), ('Console Box', 2), ('LCL', 3)
on conflict (name) do nothing;

-- Containers table — one row per physical container/柜
create table if not exists public.containers (
  id uuid primary key default gen_random_uuid(),
  container_no text,                    -- CNTR number (filled when assigned)
  booking_no text,
  e_booking_no text,
  vessel text,
  carrier text,
  carrier_agent text,
  pol text,
  pod text,
  etd date,
  eta date,
  qty_container text,                   -- e.g. "1*40HQ"
  type_id uuid references public.container_types(id) on delete set null,
  customer text,                        -- customer name (for RLS visibility)
  customer_id uuid references public.customers(id) on delete set null,
  seal_no text,
  notes text,                           -- space notes / remarks
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at
create trigger containers_updated_at
  before update on public.containers
  for each row execute function set_updated_at();

-- Container items — loading details per supplier/PO in a container
create table if not exists public.container_items (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references public.containers(id) on delete cascade,
  shipment_id uuid references public.shipments(id) on delete set null,
  supplier text,
  po text,
  customer_po text,
  tuc text,
  sku text,
  qty int,
  weight numeric(12,2),
  volume numeric(12,2),      -- CBM
  hbl text,
  notes text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_container_items_container on public.container_items(container_id);
create index if not exists idx_container_items_shipment on public.container_items(shipment_id);
create index if not exists idx_containers_customer on public.containers(customer);
create index if not exists idx_containers_customer_id on public.containers(customer_id);
create index if not exists idx_containers_booking on public.containers(booking_no);

-- ==========================================================================
-- RLS — same visibility as shipments
-- ==========================================================================

-- Helper: can current user see this container?
create or replace function public.can_see_container(c_customer text, c_customer_id uuid)
returns boolean language plpgsql stable security definer as $$
begin
  return public.can_see_shipment(c_customer, c_customer_id);
end $$;

alter table public.containers enable row level security;
alter table public.container_items enable row level security;
alter table public.container_types enable row level security;

-- container_types: everyone can read, admin can write
create policy ct_select on public.container_types for select using (true);
create policy ct_modify on public.container_types for all using (public.is_admin());

-- containers: same as shipments
create policy ctr_select on public.containers for select
  using (public.can_see_container(customer, customer_id));
create policy ctr_insert on public.containers for insert
  with check (public.current_role() in ('admin','operator','sales'));
create policy ctr_update on public.containers for update
  using (public.can_see_container(customer, customer_id));
create policy ctr_delete on public.containers for delete
  using (public.is_admin());

-- container_items: visible if parent container is visible
create policy ci_select on public.container_items for select
  using (exists (
    select 1 from public.containers c
    where c.id = container_id
    and public.can_see_container(c.customer, c.customer_id)
  ));
create policy ci_insert on public.container_items for insert
  with check (public.current_role() in ('admin','operator','sales'));
create policy ci_update on public.container_items for update
  using (exists (
    select 1 from public.containers c
    where c.id = container_id
    and public.can_see_container(c.customer, c.customer_id)
  ));
create policy ci_delete on public.container_items for delete
  using (public.current_role() in ('admin','operator'));

-- Grant access
grant select, insert, update, delete on public.containers to authenticated;
grant select, insert, update, delete on public.container_items to authenticated;
grant select, insert, update, delete on public.container_types to authenticated;
