-- ONE file to bring the database fully up to date. Paste all of it into the Supabase SQL editor and press Run.
-- Safe to re-run. Covers: pictures, reviews and start dates, follow-ups, team-wide task visibility.

alter table tp_members add column if not exists avatar text;

alter table tp_tasks add column if not exists start_date date;
alter table tp_tasks add column if not exists reviewer_id uuid references auth.users;
alter table tp_tasks add column if not exists review_note text;

drop policy if exists tp_tasks_select on tp_tasks;
create policy tp_tasks_select on tp_tasks for select using (tp_is_member(team_id));

drop policy if exists tp_tasks_update on tp_tasks;
create policy tp_tasks_update on tp_tasks for update using (
  tp_is_manager(team_id)
  or (tp_is_member(team_id) and (assignee_id = auth.uid() or created_by = auth.uid() or for_team or reviewer_id = auth.uid()))
);

create table if not exists tp_followups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references tp_teams on delete cascade,
  task_id uuid not null references tp_tasks on delete cascade,
  from_user uuid references auth.users,
  from_name text,
  to_user uuid references auth.users,
  message text,
  due_date date,
  status text not null default 'open' check (status in ('open','done')),
  reply text,
  created_at timestamptz default now(),
  done_at timestamptz
);
create index if not exists tp_followups_team_idx on tp_followups(team_id, status);
alter table tp_followups enable row level security;
drop policy if exists tp_followups_select on tp_followups;
drop policy if exists tp_followups_insert on tp_followups;
drop policy if exists tp_followups_update on tp_followups;
drop policy if exists tp_followups_delete on tp_followups;
create policy tp_followups_select on tp_followups for select using (
  tp_is_manager(team_id) or from_user = auth.uid() or to_user = auth.uid()
);
create policy tp_followups_insert on tp_followups for insert with check (tp_is_member(team_id) and from_user = auth.uid());
create policy tp_followups_update on tp_followups for update using (
  tp_is_manager(team_id) or from_user = auth.uid() or to_user = auth.uid()
);
create policy tp_followups_delete on tp_followups for delete using (tp_is_manager(team_id) or from_user = auth.uid());

notify pgrst, 'reload schema';
