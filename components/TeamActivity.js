import Link from 'next/link';
import Avatar from './Avatar';
import { fmtTime } from '@/lib/util';

const LABEL = {
  created: 'created',
  updated: 'updated',
  note: 'added a note on',
  review_requested: 'requested a review on',
  review_approved: 'approved',
  changes_requested: 'requested changes on',
  follow_up_set: 'set a follow-up on',
  follow_up_cleared: 'cleared the follow-up on',
  follow_up_asked: 'asked for a follow-up on',
  follow_up_done: 'completed a follow-up on',
};

// Every manager sees the life of the team's tasks here: who did what, and when.
export default function TeamActivity({ teamId, events, tasks, members }) {
  const title = new Map(tasks.map((t) => [t.id, t.title]));
  const pic = new Map(members.map((m) => [m.user_id, m.avatar]));
  const rows = events.filter((e) => title.has(e.task_id));

  return (
    <section className="panel activity">
      <h3>Task activity</h3>
      <p className="sub">What the team has been doing, newest first. Visible to every manager.</p>
      {rows.length === 0 && <p className="sub">Nothing yet.</p>}
      {rows.map((e) => (
        <div key={e.id} className="act-row">
          <Avatar src={pic.get(e.actor_id) || null} name={e.actor_name} size={28} />
          <div className="act-main">
            <span><b>{e.actor_name || 'Someone'}</b> {LABEL[e.type] || e.type}{' '}
              <Link href={`/t/${teamId}/tasks/${e.task_id}`}>{title.get(e.task_id)}</Link></span>
            {e.detail && <small className="sub">{e.detail}</small>}
          </div>
          <time className="sub">{fmtTime(e.created_at)}</time>
        </div>
      ))}
    </section>
  );
}
