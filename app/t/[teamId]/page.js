import Link from 'next/link';
import { getTeamCtx } from '@/lib/ctx';
import { STATUS, fmtDate, isOverdue, nameOf, sortTasks, today } from '@/lib/util';
import { createTask } from '../../actions';

export default async function Tasks({ params, searchParams }) {
  const { teamId } = await params;
  const { view = 'all', show = 'open' } = await searchParams;
  const { sb, user, team, isManager } = await getTeamCtx(teamId);

  const [{ data: all }, { data: members }] = await Promise.all([
    sb.from('tp_tasks').select('*').eq('team_id', team.id),
    sb.from('tp_members').select('user_id, name, email, role').eq('team_id', team.id),
  ]);

  let tasks = all || [];
  if (isManager && view === 'mine') tasks = tasks.filter((t) => t.assignee_id === user.id);
  const open = tasks.filter((t) => t.status !== 'done');
  const shown = sortTasks(tasks.filter((t) => (show === 'done' ? t.status === 'done' : show === 'all' ? true : t.status !== 'done')));
  const toReview = open.filter((t) => t.status === 'review');
  const followUps = open.filter((t) => t.follow_up_date && t.follow_up_date <= today());
  const q = (o) => `?${new URLSearchParams({ view, show, ...o })}`;
  const assigneeLabel = (t) => (t.for_team ? 'Whole team' : nameOf(members || [], t.assignee_id));

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{team.name}</h1>
          <p className="sub">{isManager ? 'Manager view · you see every task in this team' : 'Your tasks and tasks given to the whole team'}</p>
        </div>
      </header>

      <div className="stats">
        <div className="stat hero"><div className="label">Open</div><div className="num">{open.length}</div></div>
        <div className="stat"><div className="label">Overdue</div><div className="num" style={{ color: open.some(isOverdue) ? 'var(--red)' : undefined }}>{open.filter(isOverdue).length}</div></div>
        <div className="stat"><div className="label">{isManager ? 'To review' : 'In review'}</div><div className="num">{toReview.length}</div></div>
        <div className="stat"><div className="label">Follow-ups due</div><div className="num">{followUps.length}</div></div>
      </div>

      <details className="panel add" open={!all?.length}>
        <summary>+ New task</summary>
        <form action={createTask} className="stack">
          <input type="hidden" name="teamId" value={team.id} />
          <input name="title" placeholder="What needs doing?" required />
          <div className="row">
            <label>Urgency
              <select name="urgency" defaultValue="medium">
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </label>
            <label>Deadline <span className="sub">(optional)</span><input type="date" name="deadline" /></label>
            {isManager && (
              <label>Assign to
                <select name="assignee" defaultValue="team">
                  <option value="team">Whole team</option>
                  {(members || []).map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}{m.user_id === user.id ? ' (me)' : ''}</option>)}
                </select>
              </label>
            )}
          </div>
          <textarea name="notes" rows="2" placeholder="Notes (optional)" />
          <button className="btn primary">Add task</button>
        </form>
      </details>

      {isManager && toReview.length > 0 && (
        <section className="panel attention">
          <h3>Waiting for your review</h3>
          {toReview.map((t) => (
            <Link key={t.id} className="mini" href={`/t/${team.id}/tasks/${t.id}`}>
              <span className="t">{t.title}</span><span className="sub">{assigneeLabel(t)}</span>
            </Link>
          ))}
        </section>
      )}

      <div className="filters">
        {isManager && (<>
          <Link className={`chip ${view === 'all' ? 'on' : ''}`} href={q({ view: 'all' })}>Whole team</Link>
          <Link className={`chip ${view === 'mine' ? 'on' : ''}`} href={q({ view: 'mine' })}>Assigned to me</Link>
          <span className="sep" />
        </>)}
        {[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => (
          <Link key={k} className={`chip ${show === k ? 'on' : ''}`} href={q({ show: k })}>{l}</Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="panel empty">No tasks here yet.</div>
      ) : (
        <table>
          <thead><tr><th>Task</th><th>Urgency</th><th>Deadline</th><th>Assigned to</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.id} className="row">
                <td><Link href={`/t/${team.id}/tasks/${t.id}`}><b>{t.title}</b></Link>
                  {t.follow_up_date && <div className="sub">Follow-up {fmtDate(t.follow_up_date)}</div>}</td>
                <td><span className={`tag ${t.urgency}`}>{t.urgency}</span></td>
                <td className={isOverdue(t) ? 'overdue' : ''}>{fmtDate(t.deadline)}</td>
                <td>{assigneeLabel(t)}</td>
                <td><span className={`status ${t.status}`}>{STATUS[t.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
