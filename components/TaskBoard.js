'use client';

import Link from 'next/link';
import { useOptimistic, useRef, useState } from 'react';
import { createTask, deleteTask } from '@/app/actions';
import { STATUS, fmtDate } from '@/lib/util';
import SubmitButton from './SubmitButton';

// Add form + task table. New tasks appear instantly and deleted ones fade out
// instantly; the server action confirms in the background.
export default function TaskBoard({ teamId, rows, isManager, members, userId, show, above }) {
  const [list, addOptimistic] = useOptimistic(rows, (state, task) => [task, ...state]);
  const [leaving, setLeaving] = useState(() => new Set());
  const [gone, setGone] = useState(() => new Set());
  const formRef = useRef(null);

  async function add(fd) {
    const title = (fd.get('title') || '').toString().trim();
    if (!title) return;
    const who = fd.get('assignee');
    const label = !isManager || who === userId ? 'Me' : who === 'team' ? 'Whole team'
      : members.find((m) => m.user_id === who)?.name || 'Someone';
    if (show !== 'done')
      addOptimistic({
        id: `tmp-${Date.now()}`, title, urgency: fd.get('urgency') || 'medium',
        deadline: fd.get('deadline') || null, status: 'todo', assigneeLabel: label, overdue: false, pending: true,
      });
    formRef.current?.reset();
    await createTask(fd);
  }

  async function remove(fd) {
    const id = fd.get('id');
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => setGone((s) => new Set(s).add(id)), 260);
    await deleteTask(fd);
  }

  const visible = list.filter((t) => !gone.has(t.id));

  return (
    <>
      <details className="panel add" open={!rows.length}>
        <summary>+ New task</summary>
        <form ref={formRef} action={add} className="stack">
          <input type="hidden" name="teamId" value={teamId} />
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
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}{m.user_id === userId ? ' (me)' : ''}</option>)}
                </select>
              </label>
            )}
          </div>
          <textarea name="notes" rows="2" placeholder="Notes (optional)" />
          <SubmitButton className="btn primary">Add task</SubmitButton>
        </form>
      </details>

      {above}

      {visible.length === 0 ? (
        <div className="panel empty">No tasks here yet.</div>
      ) : (
        <table>
          <thead><tr><th>Task</th><th>Urgency</th><th>Deadline</th><th>Assigned to</th><th>Status</th>{isManager && <th />}</tr></thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} className={`row enter ${t.pending ? 'pending' : ''} ${leaving.has(t.id) ? 'leaving' : ''}`}>
                <td>
                  {t.pending ? <b>{t.title}</b> : <Link href={`/t/${teamId}/tasks/${t.id}`}><b>{t.title}</b></Link>}
                  {t.follow_up_date && <div className="sub">Follow-up {fmtDate(t.follow_up_date)}</div>}
                </td>
                <td><span className={`tag ${t.urgency}`}>{t.urgency}</span></td>
                <td className={t.overdue ? 'overdue' : ''}>{fmtDate(t.deadline)}</td>
                <td>{t.assigneeLabel}</td>
                <td><span className={`status ${t.status}`}>{STATUS[t.status]}</span></td>
                {isManager && (
                  <td>
                    {!t.pending && (
                      <form action={remove}>
                        <input type="hidden" name="teamId" value={teamId} />
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="stay" value="1" />
                        <button className="icon-btn" title="Delete task" aria-label="Delete task">✕</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
