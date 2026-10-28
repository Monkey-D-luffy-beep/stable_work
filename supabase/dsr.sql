-- DSR (Daily Shipment Report). Run once in the Supabase SQL editor, after schema.sql.
-- Safe to re-run. Everything is prefixed tp_ so it cannot clash with other apps in the project.

create table if not exists tp_shipments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references tp_teams on delete cascade,
  trl_no text,
  shipper_name text,
  shipping_line text,
  mbl text,
  hbl text,
  shipment_type text,
  cntr_qnty integer,
  cntr_type text,
  pol text,
  pod text,
  fpod text,
  etd date,
  eta date,
  bro text,
  bro_received text,
  job_status text,
  created_by uuid references auth.users,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tp_shipments_team_idx on tp_shipments(team_id, created_at);

alter table tp_shipments enable row level security;

drop policy if exists tp_shipments_select on tp_shipments;
drop policy if exists tp_shipments_insert on tp_shipments;
drop policy if exists tp_shipments_update on tp_shipments;
drop policy if exists tp_shipments_delete on tp_shipments;

-- Everyone in the team can read, add and edit shipments; only managers can delete.
create policy tp_shipments_select on tp_shipments for select using (tp_is_member(team_id));
create policy tp_shipments_insert on tp_shipments for insert with check (tp_is_member(team_id) and created_by = auth.uid());
create policy tp_shipments_update on tp_shipments for update using (tp_is_member(team_id));
create policy tp_shipments_delete on tp_shipments for delete using (tp_is_manager(team_id));

notify pgrst, 'reload schema';
