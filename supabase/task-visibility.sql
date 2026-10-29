-- Everyone in a team can SEE every task in that team (team overview).
-- Editing stays limited: managers edit anything; members edit tasks assigned to them,
-- created by them, or given to the whole team. Safe to re-run.

drop policy if exists tp_tasks_select on tp_tasks;
create policy tp_tasks_select on tp_tasks for select using (tp_is_member(team_id));
