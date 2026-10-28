import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTeamCtx } from '@/lib/ctx';
import { STATUS, fmtDate, fmtTime, nameOf } from '@/lib/util';
import { updateTask, requestReview, reviewDecision, setFollowUp, addNote, deleteTask } from '../../../../actions';

const LABEL = {
  created: 'created the task',
  updated: 'updated',
  note: 'added a note',
  review_requested: 'requested a review',
  review_approved: 'approved the task',
  changes_requested: 'requested changes',
  follow_up_set: 'set a follow-up',
  follow_up_cleared: 'cleared the follow-up',
};

export default async function TaskPage({ params }) {
  const { teamId, id } = await params;
  const { sb, user, team, isManager } = await getTeamCtx(teamId);

  const { data: t } = await sb.from('tp_tasks').select('*').eq('id', id).eq('team_id', team.id).maybeSingle();
  if (!t) notFound();
  const [{ data: events }, { data: members }] = await Promise.all([
    sb.from('tp_task_events').select('*').eq('task_id', id).order('created_at', { ascending: false }),
    sb.from('tp_members').select('user_id, name, email').eq('team_id', team.id),
  ]);

  const hidden = (<><input type="hidden" name="teamId" value={team.id} /><input type="hidden" name="id" value={t.id} /></>);
  const canRequestReview = ['todo', 'in_progress', 'changes_requested'].includes(t.status);

  return (
    <>
      <Link href={`/t/${team.id}`} className="sub">← {team.name}</Link>
      <header className="topbar">
        <div>
          <h1>{t.title}</h1>
          <p className="sub"><span className={`status ${t.status}`}>{STATUS[t.status]}</span> · {t.for_team ? 'Whole team' : nameOf(members || [], t.assignee_id)}</p>
        </div>
      </header>

      <div className="grid2">
        <div className="stack">
          <form action={updateTask} className="panel stack">
            {hidden}
            <h3>Details</h3>
            <label>Title<input name="title" defaultValue={t.title} required /></label>
            <label>Notes<textarea name="notes" rows="4" defaultValue={t.notes || ''} /></label>
            <div className="row">
              <label>Urgency
                <select name="urgency" defaultValue={t.urgency}>
                  <option value="low">Low</option><option value="medium">Medium</option>
                  <option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </label>
              <label>Deadline<input type="date" name="deadline" defaultValue={t.deadline || ''} /></label>
            </div>
            <div className="row">
              <label>Status
                <select name="status" defaultValue={t.status}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {isManager && (
                <label>Assigned to
                  <select name="assignee" defaultValue={t.for_team ? 'team' : t.assignee_id || ''}>
                    <option value="team">Whole team</option>
                    {(members || []).map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
                  </select>
                </label>
              )}
            </div>
            <button className="btn primary">Save changes</button>
          </form>

          {canRequestReview && (
            <form action={requestReview} className="panel stack">
              {hidden}
              <h3>Ready for review?</h3>
              <textarea name="comment" rows="2" placeholder="Anything the reviewer should know (optional)" />
              <button className="btn">Request review</button>
            </form>
          )}
          {t.status === 'review' && isManager && (
            <form action={reviewDecision} className="panel stack attention">
              {hidden}
              <h3>Review this task</h3>
              <textarea name="comment" rows="2" placeholder="Feedback (optional)" />
              <div className="actions">
                <button name="decision" value="approve" className="btn primary">Approve & mark done</button>
                <button name="decision" value="changes" className="btn">Request changes</button>
              </div>
            </form>
          )}
          {t.status === 'review' && !isManager && (
            <div className="panel notice">Waiting for a manager to review this task.</div>
          )}

          <form action={setFollowUp} className="panel stack">
            {hidden}
            <h3>Follow-up</h3>
            <div className="row">
              <label>Date<input type="date" name="date" defaultValue={t.follow_up_date || ''} /></label>
              <label>Reminder note<input name="note" defaultValue={t.follow_up_note || ''} /></label>
            </div>
            <button className="btn">Save follow-up</button>
            <span className="sub">Leave the date empty to clear it.</span>
          </form>

          {isManager && (
            <form action={deleteTask}>{hidden}<button className="btn danger">Delete task</button></form>
          )}
        </div>

        <div className="stack">
          <form action={addNote} className="panel stack">
            {hidden}
            <h3>Add a note</h3>
            <textarea name="text" rows="3" placeholder="Update, question, or comment…" required />
            <button className="btn primary">Post note</button>
          </form>

          <section className="panel">
            <h3>History</h3>
            {(events || []).length === 0 && <p className="sub">No history yet.</p>}
            <ol className="timeline">
              {(events || []).map((e) => (
                <li key={e.id} className={e.type}>
                  <div><b>{e.actor_id === user.id ? 'You' : e.actor_name}</b> {LABEL[e.type] || e.type}</div>
                  {e.detail && <div className="detail">{e.detail}</div>}
                  <div className="sub">{fmtTime(e.created_at)}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
