export const STATUS = {
  todo: 'To do',
  in_progress: 'In progress',
  review: 'In review',
  changes_requested: 'Changes requested',
  done: 'Done',
};
export const URGENCY = { urgent: 0, high: 1, medium: 2, low: 3 };

export const today = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (t) => !!t.deadline && t.status !== 'done' && t.deadline < today();
export const fmtDate = (d) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
export const fmtTime = (d) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function sortTasks(tasks) {
  return [...tasks].sort(
    (a, b) =>
      (a.status === 'done') - (b.status === 'done') ||
      URGENCY[a.urgency] - URGENCY[b.urgency] ||
      (a.deadline || '9999').localeCompare(b.deadline || '9999')
  );
}

export const nameOf = (members, id) => {
  const m = members.find((x) => x.user_id === id);
  return m ? m.name || m.email : 'Unassigned';
};
