-- Tiger Projects schema. Run once in the Supabase SQL editor.

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  avatar text default 'tiger',          -- preset id or public image URL
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

create table if not exists members (
  team_id uuid references teams on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'member' check (role in ('manager','member')),
  email text,
  name text,
  created_at timestamptz default now(),
  primary key (team_id, user_id)
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('manager','member')),
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
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

create table if not exists task_events (
  id bigint generated always as identity primary key,
  task_id uuid references tasks on delete cascade,
  team_id uuid references teams on delete cascade,
  actor_id uuid,
  actor_name text,
  type text not null,
  detail text,
  created_at timestamptz default now()
);

create index if not exists tasks_team_idx on tasks(team_id);
create index if not exists events_task_idx on task_events(task_id, created_at desc);

create or replace function is_member(t uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from members where team_id = t and user_id = auth.uid()) $$;

create or replace function is_manager(t uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from members where team_id = t and user_id = auth.uid() and role = 'manager') $$;

alter table teams enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table tasks enable row level security;
alter table task_events enable row level security;

-- Team creation, joining and removal go through the server (service role).
create policy teams_select on teams for select using (is_member(id));
create policy teams_update on teams for update using (is_manager(id));

create policy members_select on members for select using (is_member(team_id));

create policy invites_select on invites for select using (is_manager(team_id));
create policy invites_insert on invites for insert with check (is_manager(team_id));
create policy invites_delete on invites for delete using (is_manager(team_id));

-- Managers see everything; members see tasks assigned to them, created by them, or given to the whole team.
create policy tasks_select on tasks for select using (
  is_manager(team_id)
  or (is_member(team_id) and (assignee_id = auth.uid() or created_by = auth.uid() or for_team))
);
create policy tasks_insert on tasks for insert with check (is_member(team_id) and created_by = auth.uid());
create policy tasks_update on tasks for update using (
  is_manager(team_id)
  or (is_member(team_id) and (assignee_id = auth.uid() or created_by = auth.uid() or for_team))
);
create policy tasks_delete on tasks for delete using (is_manager(team_id));

create policy events_select on task_events for select using (
  exists (select 1 from tasks t where t.id = task_id)
);
create policy events_insert on task_events for insert with check (is_member(team_id) and actor_id = auth.uid());

-- Public bucket for uploaded team pictures.
insert into storage.buckets (id, name, public) values ('team-pictures', 'team-pictures', true)
on conflict (id) do nothing;
