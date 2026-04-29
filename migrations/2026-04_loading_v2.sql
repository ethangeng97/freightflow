-- ==========================================================================
-- Loading Details v2 — multi-line item support
-- Add product-level fields for per-SKU/TUC tracking within a shipment
-- ==========================================================================

-- Add new columns to existing loading_details table
alter table public.loading_details add column if not exists po text;
alter table public.loading_details add column if not exists sku text;
alter table public.loading_details add column if not exists tuc text;
alter table public.loading_details add column if not exists hs_code text;
alter table public.loading_details add column if not exists packing_unit text default 'CTNS';
alter table public.loading_details add column if not exists marks text;  -- 唛头
alter table public.loading_details add column if not exists supplier text;
alter table public.loading_details add column if not exists sort_order int default 0;

-- Also add container_id FK to link loading_details to containers table
alter table public.loading_details add column if not exists container_id uuid;
do $$ begin
  alter table public.loading_details
    add constraint loading_details_container_id_fkey
    foreign key (container_id) references public.containers(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists idx_loading_details_container on public.loading_details(container_id);

-- Update container_items: add shipment_id index for better lookups
create index if not exists idx_container_items_po on public.container_items(po);
create index if not exists idx_container_items_customer_po on public.container_items(customer_po);
