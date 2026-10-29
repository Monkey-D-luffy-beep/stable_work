-- Reviews (choose a reviewer, approve or request changes with feedback) and timeline start dates.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table tp_tasks add column if not exists start_date date;
alter table tp_tasks add column if not exists reviewer_id uuid references auth.users;
alter table tp_tasks add column if not exists review_note text;

-- The chosen reviewer must be able to approve or send work back even if the task is not theirs.
drop policy if exists tp_tasks_update on tp_tasks;
create policy tp_tasks_update on tp_tasks for update using (
  tp_is_manager(team_id)
  or (tp_is_member(team_id) and (assignee_id = auth.uid() or created_by = auth.uid() or for_team or reviewer_id = auth.uid()))
);

notify pgrst, 'reload schema';
