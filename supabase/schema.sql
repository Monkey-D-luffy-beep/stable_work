-- Tiger Projects schema. Run once in the Supabase SQL editor. All objects are prefixed tp_ so it is safe in a shared project.

create table if not exists tp_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  avatar text default 'tiger',          -- preset id or public image URL
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

create table if not exists tp_members (
  team_id uuid references tp_teams on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'member' check (role in ('manager','member')),
  email text,
  name text,
  created_at timestamptz default now(),
  primary key (team_id, user_id)
);

create table if not exists tp_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references tp_teams on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('manager','member')),
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists tp_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references tp_teams on delete cascade,
  title text not null,
  notes text,
  urgency text not null default 'medium' check (urgency in ('low','medium','high','urgent')),
  deadline date,
  status text not null default 'todo' check (status in ('todo','in_progress','review','changes_requested','done')),
  assignee_id uuid references auth.users,
  for_team boolean not null default false,   -- assigned to the whole team
  created_by uuid references auth.users,
  follow_up_date date,
  follow_up_note text,
  review_requested_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tp_task_events (
  id bigint generated always as identity primary key,
  task_id uuid references tp_tasks on delete cascade,
  team_id uuid references tp_teams on delete cascade,
  actor_id uuid,
  actor_name text,
  type text not null,
  detail text,
  created_at timestamptz default now()
);

create index if not exists tp_tasks_team_idx on tp_tasks(team_id);
create index if not exists tp_events_task_idx on tp_task_events(task_id, created_at desc);

create or replace function tp_is_member(t uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from tp_members where team_id = t and user_id = auth.uid()) $$;

create or replace function tp_is_manager(t uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from tp_members where team_id = t and user_id = auth.uid() and role = 'manager') $$;

alter table tp_teams enable row level security;
alter table tp_members enable row level security;
alter table tp_invites enable row level security;
alter table tp_tasks enable row level security;
alter table tp_task_events enable row level security;

-- Team creation, joining and removal go through the server (service role).
create policy tp_teams_select on tp_teams for select using (tp_is_member(id));
create policy tp_teams_update on tp_teams for update using (tp_is_manager(id));

create policy tp_members_select on tp_members for select using (tp_is_member(team_id));

create policy tp_invites_select on tp_invites for select using (tp_is_manager(team_id));
create policy tp_invites_insert on tp_invites for insert with check (tp_is_manager(team_id));
create policy tp_invites_delete on tp_invites for delete using (tp_is_manager(team_id));

-- Everyone in a team can see every task in it (team overview).
-- Editing is limited: managers edit anything; members edit tasks assigned to them, created by them, or given to the whole team.
create policy tp_tasks_select on tp_tasks for select using (tp_is_member(team_id));
create policy tp_tasks_insert on tp_tasks for insert with check (tp_is_member(team_id) and created_by = auth.uid());
create policy tp_tasks_update on tp_tasks for update using (
  tp_is_manager(team_id)
  or (tp_is_member(team_id) and (assignee_id = auth.uid() or created_by = auth.uid() or for_team))
);
create policy tp_tasks_delete on tp_tasks for delete using (tp_is_manager(team_id));

create policy tp_events_select on tp_task_events for select using (
  exists (select 1 from tp_tasks t where t.id = task_id)
);
create policy tp_events_insert on tp_task_events for insert with check (tp_is_member(team_id) and actor_id = auth.uid());

-- Public bucket for uploaded team pictures.
insert into storage.buckets (id, name, public) values ('team-pictures', 'team-pictures', true)
on conflict (id) do nothing;



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



alter table tp_teams add column if not exists join_token text;
alter table tp_teams add column if not exists join_enabled boolean not null default true;

-- Existing teams get a link straight away.
update tp_teams set join_token = encode(gen_random_bytes(9), 'hex') where join_token is null;

create unique index if not exists tp_teams_join_token_key on tp_teams(join_token);

notify pgrst, 'reload schema';
