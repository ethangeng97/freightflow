-- Add entry tracking fields to shipments
alter table shipments add column if not exists entry_done boolean default false;
alter table shipments add column if not exists entry_number text;

-- Trigger: only operator (and admin) can modify entry_done / entry_number
create or replace function shipments_entry_guard()
returns trigger language plpgsql security definer as $$
declare
  _role text;
begin
  _role := coalesce(
    (select role from public.user_profiles where id = auth.uid()),
    'operator'
  );
  -- Only admin and operator may change entry fields
  if _role not in ('admin', 'operator') then
    new.entry_done   := old.entry_done;
    new.entry_number  := old.entry_number;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shipments_entry_guard on shipments;
create trigger trg_shipments_entry_guard
  before update on shipments
  for each row execute function shipments_entry_guard();
