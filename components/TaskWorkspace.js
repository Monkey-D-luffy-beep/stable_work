'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addTaskQuick, patchTaskQuick, removeTaskQuick, requestReviewQuick, decideReviewQuick, askFollowUp, completeFollowUp } from '@/app/actions';
import { STATUS, URGENCY, fmtDate } from '@/lib/util';
import { addDays, layoutWeek, parseISO, toISO, weekStartOf } from '@/lib/timeline';
import { defaultAvatar } from '@/lib/avatars';
import Avatar from './Avatar';
import DatePicker from './DatePicker';

const COLS = [
  { id: 'todo', label: 'To do', status: 'todo' },
  { id: 'progress', label: 'In progress', status: 'in_progress' },
  { id: 'done', label: 'Done', status: 'done' },
];
const colOf = (s) => (s === 'todo' ? 'todo' : s === 'done' ? 'done' : 'progress');
const todayStr = () => toISO(new Date());
const short = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const ageDays = (ts) => (ts ? Math.floor((Date.now() - new Date(ts)) / 864e5) : 0);
const ageLabel = (ts) => { const d = ageDays(ts); return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`; };
const isStale = (ts) => ageDays(ts) >= 2;

const byUrgency = (a, b) => URGENCY[a.urgency] - URGENCY[b.urgency] || (a.deadline || '9999').localeCompare(b.deadline || '9999');

// Ready-made feedback people can tap, then edit.
const FEEDBACK_OK = ['Looks good, approved', 'Great work', 'Approved, please share the final copy'];
const FEEDBACK_FIX = ['Please add more detail', 'Documents are missing or incorrect', 'Check the figures and resubmit', 'Needs a fix, then send it back for review'];

// Search, person filter and view switching all happen in the browser, so they are instant.
export default function TaskWorkspace({ teamId, initialTasks, initialFollowups = [], members, userId, isManager }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [followups, setFollowups] = useState(initialFollowups);
  const [view, setView] = useState(isManager ? 'board' : 'focus');
  const [person, setPerson] = useState(isManager ? 'all' : 'me');
  const [scope, setScope] = useState('open');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [leaving, setLeaving] = useState(() => new Set());
  const [err, setErr] = useState('');
  // timeline
  const [anchor, setAnchor] = useState(() => weekStartOf(new Date()));
  const [weeks, setWeeks] = useState(3);
  const [weekend, setWeekend] = useState(false);
  const inflight = useRef(0);
  const today = todayStr();

  useEffect(() => { try { const v = localStorage.getItem('sw-view'); if (v) setView(v); } catch {} }, []);
  const changeView = (v) => { setView(v); try { localStorage.setItem('sw-view', v); } catch {} };

  // Pick up fresh server data (after a refresh) unless a change is still being saved.
  useEffect(() => { if (!inflight.current) { setTasks(initialTasks); setFollowups(initialFollowups); } }, [initialTasks, initialFollowups]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !inflight.current) router.refresh(); };
    document.addEventListener('visibilitychange', refresh);
    const id = setInterval(refresh, 45000);
    return () => { document.removeEventListener('visibilitychange', refresh); clearInterval(id); };
  }, [router]);
  useEffect(() => { if (!err) return; const t = setTimeout(() => setErr(''), 4500); return () => clearTimeout(t); }, [err]);

  const memberOf = (id) => members.find((x) => x.user_id === id);
  const nameOf = (id) => { const m = memberOf(id); return m ? m.name || m.email : 'Unassigned'; };
  const avatarOf = (id) => { const m = memberOf(id); return m ? m.avatar || defaultAvatar(m.email) : null; };
  // Names the person whose review is pending. Older tasks with no reviewer chosen show the people who can review.
  const reviewerLabel = (t) => {
    if (t.reviewer_id) return nameOf(t.reviewer_id);
    const names = members.filter((m) => m.role === 'manager').map((m) => (m.name || m.email).split(' ')[0]);
    return names.length ? names.slice(0, 2).join(' or ') : 'the team';
  };
  const who = (t) => (t.for_team ? 'Whole team' : t.assignee_id ? nameOf(t.assignee_id) : 'Unassigned');
  // Members change only their own tasks (or tasks given to the whole team); managers change anything.
  const firstName = (t) => (t.for_team ? 'Team' : t.assignee_id ? nameOf(t.assignee_id).split(/[\s@]/)[0] : '');
  const canEdit = (t) => isManager || t.assignee_id === userId || t.for_team;
  const isOver = (t) => !!t.deadline && t.status !== 'done' && t.deadline < today;
  const canDecide = (t) => t.status === 'review' && (isManager || t.reviewer_id === userId);

  function applyLocal(t, patch) {
    const n = { ...t };
    for (const k of ['title', 'notes', 'urgency', 'deadline', 'start_date', 'status']) if (k in patch) n[k] = patch[k] || (['notes', 'deadline', 'start_date'].includes(k) ? null : n[k]);
    if ('status' in patch) n.completed_at = patch.status === 'done' ? t.completed_at || new Date().toISOString() : null;
    if ('assignee' in patch && isManager) {
      if (patch.assignee === 'team') { n.for_team = true; n.assignee_id = null; } else { n.for_team = false; n.assignee_id = patch.assignee || userId; }
    }
    return n;
  }

  // Applies a change on screen at once, then confirms it with the server (undoes it if that fails).
  async function run(id, local, call) {
    const before = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? local(t) : t)));
    inflight.current++;
    try {
      const r = await call();
      if (!r.ok) { setTasks(before); setErr(r.error || 'Could not save that change'); }
      else if (r.task) setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...r.task } : t)));
    } catch { setTasks(before); setErr('Could not save. Check your connection.'); }
    finally { inflight.current--; }
  }

  const change = (id, patch) => run(id, (t) => applyLocal(t, patch), () => patchTaskQuick({ teamId, id, patch }));
  const askReview = (id, reviewer, message) =>
    run(id, (t) => ({ ...t, status: 'review', reviewer_id: reviewer, review_note: null, completed_at: null }), () => requestReviewQuick({ teamId, id, reviewer, message }));
  const decide = (id, decision, feedback) =>
    run(id, (t) => (decision === 'approve'
      ? { ...t, status: 'done', review_note: feedback || null, completed_at: new Date().toISOString() }
      : { ...t, status: 'changes_requested', review_note: feedback, completed_at: null }),
    () => decideReviewQuick({ teamId, id, decision, feedback }));

  async function ask(taskId, to, message, due) {
    const tmp = `tmp-${Date.now()}`;
    const me = memberOf(userId);
    setFollowups((fs) => [{ id: tmp, team_id: teamId, task_id: taskId, from_user: userId, from_name: me?.name || 'You', to_user: to, message: message || null, due_date: due || null, status: 'open', created_at: new Date().toISOString(), pending: true }, ...fs]);
    inflight.current++;
    try {
      const r = await askFollowUp({ teamId, taskId, to, message, due });
      if (r.ok) setFollowups((fs) => fs.map((f) => (f.id === tmp ? r.followup : f)));
      else { setFollowups((fs) => fs.filter((f) => f.id !== tmp)); setErr(r.error || 'Could not send the follow-up'); }
    } catch { setFollowups((fs) => fs.filter((f) => f.id !== tmp)); setErr('Could not send. Check your connection.'); }
    finally { inflight.current--; }
  }

  async function finishFollowUp(id, reply) {
    const before = followups;
    setFollowups((fs) => fs.map((f) => (f.id === id ? { ...f, status: 'done', reply: reply || null, done_at: new Date().toISOString() } : f)));
    inflight.current++;
    try {
      const r = await completeFollowUp({ teamId, id, reply });
      if (!r.ok) { setFollowups(before); setErr(r.error || 'Could not save'); }
    } catch { setFollowups(before); setErr('Could not save. Check your connection.'); }
    finally { inflight.current--; }
  }

  async function add(title, colId, assignee, extra = {}) {
    const status = COLS.find((c) => c.id === colId)?.status || 'todo';
    const tmp = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const asg = isManager ? assignee : '';
    setTasks((ts) => [{
      id: tmp, title, notes: null, urgency: 'medium', deadline: extra.deadline || null, start_date: null, status, pending: true, created_by: userId,
      created_at: new Date().toISOString(), for_team: asg === 'team', assignee_id: asg === 'team' ? null : asg || userId, follow_up_date: null,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    }, ...ts]);
    inflight.current++;
    try {
      const r = await addTaskQuick({ teamId, title, status, assignee: asg, deadline: extra.deadline || null });
      if (r.ok) setTasks((ts) => ts.map((t) => (t.id === tmp ? r.task : t)));
      else { setTasks((ts) => ts.filter((t) => t.id !== tmp)); setErr(r.error || 'Could not add the task'); }
    } catch { setTasks((ts) => ts.filter((t) => t.id !== tmp)); setErr('Could not add the task. Check your connection.'); }
    finally { inflight.current--; }
  }

  async function remove(id) {
    const before = tasks;
    setOpenId(null);
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => setTasks((ts) => ts.filter((t) => t.id !== id)), 230);
    inflight.current++;
    try {
      const r = await removeTaskQuick({ teamId, id });
      if (!r.ok) { setTasks(before); setErr(r.error || 'Could not delete'); }
    } catch { setTasks(before); setErr('Could not delete. Check your connection.'); }
    finally { inflight.current--; setLeaving((s) => { const n = new Set(s); n.delete(id); return n; }); }
  }

  const statusFor = (t, colId) => (colOf(t.status) === colId ? t.status : COLS.find((c) => c.id === colId).status);
  const moveTo = (t, colId) => { if (canEdit(t) && !t.pending && colOf(t.status) !== colId) change(t.id, { status: statusFor(t, colId) }); };

  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (person === 'me' && t.assignee_id !== userId) return false;
      if (person === 'team' && !t.for_team) return false;
      if (!['all', 'me', 'team'].includes(person) && t.assignee_id !== person) return false;
      return !n || `${t.title} ${t.notes || ''}`.toLowerCase().includes(n);
    });
  }, [tasks, person, q, userId]);

  const open = tasks.filter((t) => t.status !== 'done');
  const myReviews = tasks.filter((t) => t.status === 'review' && (t.reviewer_id === userId || (isManager && !t.reviewer_id)));
  const openFollowups = followups.filter((f) => f.status === 'open');
  const myFollowups = openFollowups.filter((f) => f.to_user === userId);
  const pendingMine = myReviews.length + myFollowups.length;
  const reviewsElsewhere = tasks.filter((t) => t.status === 'review' && !myReviews.some((r) => r.id === t.id));
  const followupsElsewhere = openFollowups.filter((f) => f.to_user !== userId);
  const teamPending = isManager ? reviewsElsewhere.length + followupsElsewhere.length : 0;
  const taskOf = (id) => tasks.find((t) => t.id === id);

  const stats = [
    ['Open', open.length, true],
    ['Overdue', open.filter(isOver).length, false, open.some(isOver) && 'var(--red)'],
    ['In review', open.filter((t) => t.status === 'review').length],
    ['Follow-ups due', open.filter((t) => t.follow_up_date && t.follow_up_date <= today).length],
  ];

  const listed = visible.filter((t) => (scope === 'open' ? t.status !== 'done' : scope === 'done' ? t.status === 'done' : true));
  const selected = tasks.find((t) => t.id === openId);

  /* ---------------- board ---------------- */

  const card = (t) => {
    const col = colOf(t.status);
    const idx = COLS.findIndex((c) => c.id === col);
    const editable = canEdit(t) && !t.pending;
    return (
      <div key={t.id}
        className={`kcard u-${t.urgency} ${t.pending ? 'pending' : ''} ${leaving.has(t.id) ? 'leaving' : ''} ${dragId === t.id ? 'dragging' : ''} ${!canEdit(t) ? 'ro' : ''}`}
        draggable={editable}
        onDragStart={(e) => { setDragId(t.id); e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragId(null); setOver(null); }}
        onClick={() => !t.pending && setOpenId(t.id)}>
        <div className="kc-title">{t.title}</div>
        <div className="kc-meta">
          <span className={`tag ${t.urgency}`}>{t.urgency}</span>
          {t.deadline && <span className={isOver(t) ? 'overdue' : ''}>{fmtDate(t.deadline)}</span>}
          {t.status === 'review' && <span className="status review">In review{t.reviewer_id ? ` · ${nameOf(t.reviewer_id).split(' ')[0]}` : ''}</span>}
          {t.status === 'changes_requested' && <span className="status changes_requested">Changes requested</span>}
          <span className="kc-av"><span className="kc-who">{firstName(t)}</span><Avatar src={t.for_team ? null : avatarOf(t.assignee_id)} name={who(t)} size={26} /></span>
        </div>
        {editable && (
          <div className="kc-move" onClick={(e) => e.stopPropagation()}>
            <button type="button" disabled={idx === 0} onClick={() => moveTo(t, COLS[idx - 1].id)} aria-label="Move left">‹</button>
            <button type="button" disabled={idx === COLS.length - 1} onClick={() => moveTo(t, COLS[idx + 1].id)} aria-label="Move right">›</button>
          </div>
        )}
      </div>
    );
  };

  const board = (
    <div className="kb">
      {COLS.map((col) => {
        let items = visible.filter((t) => colOf(t.status) === col.id);
        items = col.id === 'done' ? items.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')) : items.sort(byUrgency);
        const shown = col.id === 'done' ? items.slice(0, 30) : items;
        return (
          <div key={col.id} className={`kb-col ${over === col.id ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); setOver(null); const t = tasks.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (t) moveTo(t, col.id); }}>
            <div className="kb-head"><span className={`dot c-${col.id}`} />{col.label}<span className="n">{items.length}</span></div>
            <div className="kb-list">{shown.map(card)}</div>
            {items.length > shown.length && <p className="sub kb-more">+ {items.length - shown.length} older completed</p>}
            <QuickAdd isManager={isManager} members={members} userId={userId}
              defaultAssignee={['all', 'me'].includes(person) ? (isManager ? (person === 'me' ? userId : 'team') : '') : person}
              onAdd={(title, assignee) => add(title, col.id, assignee)} />
          </div>
        );
      })}
    </div>
  );

  /* ---------------- timeline (calendar) ---------------- */

  const weekRows = useMemo(
    () => Array.from({ length: weeks }, (_, i) => {
      const start = addDays(anchor, i * 7);
      return { start, ...layoutWeek(listed.filter((t) => t.deadline), start, weekend) };
    }),
    [anchor, weeks, weekend, listed],
  );
  const noDeadline = listed.filter((t) => !t.deadline);
  const rangeEnd = addDays(anchor, weeks * 7 - 1);
  const monthLabel = anchor.getMonth() === rangeEnd.getMonth()
    ? anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${anchor.toLocaleDateString('en-GB', { month: 'short' })} – ${rangeEnd.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;

  const timeline = (
    <div className="cal">
      <div className="cal-top">
        <button className="icon-btn" onClick={() => setAnchor((a) => addDays(a, -7))} aria-label="Previous week">‹</button>
        <button className="btn sm" onClick={() => setAnchor(weekStartOf(new Date()))}>Today</button>
        <button className="icon-btn" onClick={() => setAnchor((a) => addDays(a, 7))} aria-label="Next week">›</button>
        <b className="cal-month">{monthLabel}</b>
        <input type="date" className="cal-goto" aria-label="Jump to date" title="Jump to a date" value="" onChange={(e) => e.target.value && setAnchor(weekStartOf(parseISO(e.target.value)))} />
        <span className="cal-opts">
          <label className="cal-wk"><input type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} /> Weekends</label>
          <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Weeks shown">
            {[2, 3, 4, 6].map((n) => <option key={n} value={n}>{n} weeks</option>)}
          </select>
        </span>
      </div>

      <div className="cal-scroll">
        <div className="cal-inner">
          <div className="cal-heads" style={{ '--n': weekend ? 7 : 5 }}>
            {(weekend ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] : ['MON', 'TUE', 'WED', 'THU', 'FRI']).map((d) => <div key={d}>{d}</div>)}
          </div>
          {weekRows.map((w) => (
            <section key={toISO(w.start)} className="cal-week" style={{ '--n': w.days.length }}>
              <div className="cal-days">
                {w.days.map((d) => (
                  <div key={d} className={`cal-day ${d === today ? 'today' : ''}`}><b>{parseISO(d).getDate()}</b>
                    {parseISO(d).getDate() === 1 && <small>{parseISO(d).toLocaleDateString('en-GB', { month: 'short' })}</small>}</div>
                ))}
              </div>
              <div className="cal-grid" style={{ gridTemplateRows: `repeat(${w.laneCount}, 30px)` }}>
                {w.bars.map((b) => (
                  <button key={b.task.id} type="button" onClick={() => setOpenId(b.task.id)}
                    className={`tbar u-${b.task.urgency} ${b.task.status === 'done' ? 'is-done' : ''} ${isOver(b.task) ? 'is-over' : ''} ${b.contLeft ? 'cont-l' : ''} ${b.contRight ? 'cont-r' : ''}`}
                    style={{ gridColumn: `${b.cs + 1} / ${b.ce + 2}`, gridRow: b.lane + 1 }}
                    title={`${b.task.title} · ${who(b.task)}${b.task.deadline ? ` · due ${fmtDate(b.task.deadline)}` : ''}`}>
                    {b.contLeft && <span aria-hidden>‹</span>}
                    <span className="tt">{b.task.title}</span>
                    <span className="tw">{firstName(b.task)}</span>
                    {b.task.status === 'review' && <em>review</em>}
                    {b.contRight && <span aria-hidden>›</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {noDeadline.length > 0 && (
        <div className="cal-nodate">
          <span className="sub">No deadline ({noDeadline.length})</span>
          {noDeadline.slice(0, 12).map((t) => <button key={t.id} type="button" className="chip" onClick={() => setOpenId(t.id)}>{t.title}</button>)}
        </div>
      )}
      <TimelineAdd isManager={isManager} members={members} userId={userId} onAdd={(title, assignee, deadline) => add(title, 'todo', assignee, { deadline })} />
    </div>
  );

  /* ---------------- review: reviews and follow-ups ---------------- */

  const reviewRow = (t, actions) => (
    <div key={t.id} className="rv-row">
      <button type="button" className="rv-main" onClick={() => setOpenId(t.id)}>
        <span className="rv-title">{t.title}</span>
        <span className="rv-meta">
          <span className={`tag ${t.urgency}`}>{t.urgency}</span>
          <span>{t.assignee_id ? `from ${nameOf(t.assignee_id)}` : who(t)}</span>
          <span className={isStale(t.review_requested_at || t.updated_at) ? 'stale' : ''}>waiting {ageLabel(t.review_requested_at || t.updated_at)}</span>
        </span>
      </button>
      {actions}
    </div>
  );

  const followRow = (f, mine) => {
    const t = taskOf(f.task_id);
    return (
      <FollowRow key={f.id} f={f} task={t} mine={mine} nameOf={nameOf}
        onOpen={() => t && setOpenId(t.id)} onDone={(reply) => finishFollowUp(f.id, reply)} />
    );
  };

  const section = (title, count, children, tone = '') => count > 0 && (
    <section className={`fc-group ${tone}`}>
      <header className="tl-head"><h3>{title}</h3><span className="n">{count}</span></header>
      <div className="fc-rows">{children}</div>
    </section>
  );

  const asked = tasks.filter((t) => t.status === 'review' && !myReviews.some((r) => r.id === t.id) && (t.assignee_id === userId || t.created_by === userId));
  const mineAsked = openFollowups.filter((f) => f.from_user === userId && f.to_user !== userId);
  const changesForMe = tasks.filter((t) => t.status === 'changes_requested' && (t.assignee_id === userId || t.for_team || t.created_by === userId));
  const recentlyApproved = tasks.filter((t) => t.status === 'done' && t.review_note && t.completed_at && ageDays(t.completed_at) <= 7).slice(0, 5);
  const everythingEmpty = !pendingMine && !teamPending && !asked.length && !mineAsked.length && !changesForMe.length && !recentlyApproved.length;

  const reviewView = everythingEmpty ? (
    <div className="panel empty">Nothing waiting on anyone. 🎉<br />
      <span className="sub">Open any task and choose “Request review” or “Ask for a follow-up” to start.</span></div>
  ) : (
    <div className="fc">
      {section('Needs your review', myReviews.length, myReviews.map((t) => reviewRow(t,
        <div className="rv-actions">
          <button type="button" className="btn primary sm" onClick={() => decide(t.id, 'approve', '')}>Approve</button>
          <button type="button" className="btn sm" onClick={() => setOpenId(t.id)}>Give feedback</button>
        </div>)), 'review')}
      {section('Follow-ups for you', myFollowups.length, myFollowups.map((f) => followRow(f, true)), 'today')}
      {section('Changes requested on your work', changesForMe.length, changesForMe.map((t) => (
        <div key={t.id} className="rv-row warn">
          <button type="button" className="rv-main" onClick={() => setOpenId(t.id)}>
            <span className="rv-title">{t.title}</span>
            <span className="rv-meta"><span>{t.reviewer_id ? `${nameOf(t.reviewer_id)} says` : 'Feedback'}:</span><em>“{t.review_note || 'No note left'}”</em></span>
          </button>
        </div>)), 'late')}
      {isManager && section('Pending across the team', teamPending, [
        ...reviewsElsewhere.map((t) => reviewRow(t, <span className="rv-with">with {reviewerLabel(t)}</span>)),
        ...followupsElsewhere.map((f) => followRow(f, false)),
      ])}
      {section('Waiting on others', asked.length + mineAsked.length, [
        ...asked.map((t) => reviewRow(t, <span className="rv-with">with {reviewerLabel(t)}</span>)),
        ...mineAsked.map((f) => followRow(f, false)),
      ])}
      {section('Recently approved', recentlyApproved.length, recentlyApproved.map((t) => (
        <div key={t.id} className="rv-row ok">
          <button type="button" className="rv-main" onClick={() => setOpenId(t.id)}>
            <span className="rv-title">{t.title}</span>
            <span className="rv-meta"><span>{t.reviewer_id ? `Approved by ${nameOf(t.reviewer_id)}` : 'Approved'}</span><em>“{t.review_note}”</em></span>
          </button>
        </div>)))}
    </div>
  );

  /* ---------------- focus: what needs me, in order ---------------- */

  const focusGroups = useMemo(() => {
    const mine = tasks.filter((t) => t.status !== 'done' && !t.pending && (t.assignee_id === userId || t.for_team));
    const soon = toISO(addDays(new Date(), 7));
    const reviewIds = new Set(myReviews.map((t) => t.id));
    const rest = mine.filter((t) => !reviewIds.has(t.id));
    const sort = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || URGENCY[a.urgency] - URGENCY[b.urgency];
    return [
      { key: 'review', label: 'Needs your review', tone: 'review', tasks: myReviews.slice().sort(sort) },
      { key: 'late', label: 'Overdue', tone: 'late', tasks: rest.filter((t) => t.deadline && t.deadline < today).sort(sort) },
      { key: 'today', label: 'Due today', tone: 'today', tasks: rest.filter((t) => t.deadline === today).sort(sort) },
      { key: 'week', label: 'This week', tone: '', tasks: rest.filter((t) => t.deadline && t.deadline > today && t.deadline <= soon).sort(sort) },
      { key: 'later', label: 'Later', tone: '', tasks: rest.filter((t) => t.deadline && t.deadline > soon).sort(sort) },
      { key: 'none', label: 'No deadline', tone: '', tasks: rest.filter((t) => !t.deadline).sort(sort) },
    ].filter((g) => g.tasks.length);
  }, [tasks, userId, today, myReviews]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusView = focusGroups.length === 0 ? (
    <div className="panel empty">Nothing needs you right now. 🎉<br /><span className="sub">Use the Board to see the whole team, or add a task.</span></div>
  ) : (
    <div className="fc">
      {focusGroups.map((g) => (
        <section key={g.key} className={`fc-group ${g.tone}`}>
          <header className="tl-head"><h3>{g.label}</h3><span className="n">{g.tasks.length}</span></header>
          <div className="fc-rows">
            {g.tasks.map((t) => (
              <div key={t.id} className={`fc-row u-${t.urgency} ${leaving.has(t.id) ? 'leaving' : ''}`}>
                <button type="button" className="fc-check" disabled={!canEdit(t) || t.status === 'review'} title={t.status === 'review' ? 'Waiting for review' : 'Mark done'}
                  aria-label="Mark done" onClick={() => change(t.id, { status: 'done' })} />
                <button type="button" className="fc-main" onClick={() => setOpenId(t.id)}>
                  <span className="fc-title">{t.title}</span>
                  <span className="fc-meta">
                    <span className={`tag ${t.urgency}`}>{t.urgency}</span>
                    {t.status === 'in_progress' && <span className="status in_progress">In progress</span>}
                    {t.status === 'review' && <span className="status review">In review</span>}
                    {t.status === 'changes_requested' && <span className="status changes_requested">Changes requested</span>}
                    {t.for_team && <span className="sub">Whole team</span>}
                  </span>
                </button>
                <span className={`fc-due ${t.deadline && t.deadline < today ? 'overdue' : t.deadline === today ? 'now' : ''}`}>
                  {!t.deadline ? '' : t.deadline === today ? 'Today' : t.deadline < today ? `${Math.round((parseISO(today) - parseISO(t.deadline)) / 864e5)}d late` : fmtDate(t.deadline)}
                </span>
                {t.status === 'todo' && canEdit(t) && <button type="button" className="btn sm" onClick={() => change(t.id, { status: 'in_progress' })}>Start</button>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  const listView = listed.length === 0 ? <div className="panel empty">Nothing to show for these filters.</div> : (
    <table>
      <thead><tr><th>Task</th><th>Urgency</th><th>Deadline</th><th>Assigned to</th><th>Status</th></tr></thead>
      <tbody>
        {listed.slice().sort(byUrgency).map((t) => (
          <tr key={t.id} className={`row ${t.pending ? 'pending' : ''} ${leaving.has(t.id) ? 'leaving' : ''}`} onClick={() => !t.pending && setOpenId(t.id)}>
            <td><b>{t.title}</b></td>
            <td><span className={`tag ${t.urgency}`}>{t.urgency}</span></td>
            <td className={isOver(t) ? 'overdue' : ''}>{fmtDate(t.deadline)}</td>
            <td>{who(t)}</td>
            <td><span className={`status ${t.status}`}>{STATUS[t.status]}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="stats">
        {stats.map(([label, n, hero, color]) => (
          <div key={label} className={`stat ${hero ? 'hero' : ''}`}>
            <div className="label">{label}</div>
            <div className="num" style={color ? { color } : undefined}>{n}</div>
          </div>
        ))}
      </div>

      {view !== 'review' && (pendingMine > 0 || teamPending > 0) && (
        <button type="button" className="pending-banner" onClick={() => changeView('review')}>
          <span className="pb-dot" />
          <span>
            {pendingMine > 0 && <b>{[myReviews.length && `${myReviews.length} review${myReviews.length === 1 ? '' : 's'}`, myFollowups.length && `${myFollowups.length} follow-up${myFollowups.length === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} waiting for you</b>}
            {pendingMine > 0 && teamPending > 0 && <span> · </span>}
            {teamPending > 0 && <span>{teamPending} more pending with others</span>}
          </span>
          <span className="pb-go">Open Review →</span>
        </button>
      )}

      <div className="ws-bar">
        <div className="tabs" role="tablist">
          {[['focus', 'Focus'], ['board', 'Board'], ['timeline', 'Timeline'], ['list', 'List'], ['review', 'Review']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => changeView(k)}>{l}{k === 'review' && pendingMine + teamPending > 0 && <i className="tab-badge">{pendingMine + teamPending}</i>}</button>
          ))}
        </div>
        <input className="ws-search" type="search" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ws-person" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
          <option value="all">{isManager ? 'Everyone' : 'Whole team'}</option>
          <option value="me">Assigned to me</option>
          <option value="team">Given to the whole team</option>
          {members.filter((m) => m.user_id !== userId).map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
        </select>
        {(view === 'timeline' || view === 'list') && (
          <div className="seg">
            {[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => (
              <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {view === 'focus' ? focusView : view === 'board' ? board : view === 'timeline' ? timeline : view === 'review' ? reviewView : listView}

      {selected && (
        <TaskSheet key={selected.id} task={selected} teamId={teamId} members={members} isManager={isManager} userId={userId}
          editable={canEdit(selected)} canDecide={canDecide(selected)} nameOf={nameOf} reviewerLabel={reviewerLabel}
          followups={followups.filter((f) => f.task_id === selected.id)}
          onAskFollowUp={(to, message, due) => ask(selected.id, to, message, due)}
          onFinishFollowUp={finishFollowUp}
          onChange={(patch) => change(selected.id, patch)}
          onAskReview={(reviewer, message) => askReview(selected.id, reviewer, message)}
          onDecide={(decision, feedback) => decide(selected.id, decision, feedback)}
          onRemove={() => remove(selected.id)} onClose={() => setOpenId(null)} />
      )}
      {err && <div className="toast" role="alert">{err}</div>}
    </>
  );
}

// Inline "+ Add task" at the bottom of a column. Stays open so several tasks can be added quickly.
function QuickAdd({ isManager, members, userId, defaultAssignee, onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [who, setWho] = useState(defaultAssignee);
  useEffect(() => setWho(defaultAssignee), [defaultAssignee]);

  if (!open) return <button type="button" className="kb-add" onClick={() => setOpen(true)}>+ Add task</button>;
  return (
    <form className="kb-quick" onSubmit={(e) => { e.preventDefault(); const t = title.trim(); if (!t) return; onAdd(t, who); setTitle(''); }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title, then Enter"
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      {isManager && (
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assign to">
          <option value="team">Whole team</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}{m.user_id === userId ? ' (me)' : ''}</option>)}
        </select>
      )}
      <div className="kb-quick-actions">
        <button className="btn primary sm">Add</button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}

// "+ Add task" under the calendar: a title and a deadline put it straight on the timeline.
function TimelineAdd({ isManager, members, userId, onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [who, setWho] = useState(isManager ? 'team' : '');

  if (!open) return <button type="button" className="cal-add" onClick={() => setOpen(true)}>+ Add task</button>;
  return (
    <form className="cal-addform" onSubmit={(e) => { e.preventDefault(); const t = title.trim(); if (!t) return; onAdd(t, who, date || null); setTitle(''); }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <DatePicker label="Deadline" value={date} onChange={setDate} />
      {isManager && (
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assign to">
          <option value="team">Whole team</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}{m.user_id === userId ? ' (me)' : ''}</option>)}
        </select>
      )}
      <button className="btn primary sm">Add</button>
      <button type="button" className="btn sm" onClick={() => setOpen(false)}>Close</button>
    </form>
  );
}

// Side panel: every field saves as you change it, and reviews are requested and decided here.
function TaskSheet({ task: t, teamId, members, isManager, userId, editable, canDecide, nameOf, reviewerLabel, followups, onAskFollowUp, onFinishFollowUp, onChange, onAskReview, onDecide, onRemove, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const canRequest = editable && ['todo', 'in_progress', 'changes_requested'].includes(t.status);

  // Reviewer choices: managers first, then everyone else (never yourself unless you are the only option).
  const others = members.filter((m) => m.user_id !== userId);
  const pool = others.length ? others : members;
  const managers = pool.filter((m) => m.role === 'manager');
  const rest = pool.filter((m) => m.role !== 'manager');

  const [asking, setAsking] = useState(false);
  const [reviewer, setReviewer] = useState(t.reviewer_id && pool.some((m) => m.user_id === t.reviewer_id) ? t.reviewer_id : (managers[0] || pool[0])?.user_id || '');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [fuOpen, setFuOpen] = useState(false);
  const [fuTo, setFuTo] = useState((t.assignee_id && t.assignee_id !== userId ? t.assignee_id : others[0]?.user_id) || '');
  const [fuMsg, setFuMsg] = useState('');
  const [fuDue, setFuDue] = useState('');
  const addChip = (text) => setFeedback((f) => (f ? `${f.trim()} ${text}` : text));

  const field = (label, el) => <label>{label}{el}</label>;

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <aside className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Task details">
        <div className="sheet-head">
          <select value={t.status} disabled={!editable} onChange={(e) => onChange({ status: e.target.value })} className={`status-select ${t.status}`}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <input className="sheet-title" defaultValue={t.title} disabled={!editable}
          onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && onChange({ title: e.target.value })} />
        {!editable && <p className="notice">You can view this task. Only the people working on it can change it.</p>}

        {/* ---- review ---- */}
        {t.status === 'changes_requested' && (
          <div className="review-box warn">
            <b>Changes requested{t.reviewer_id ? ` by ${nameOf(t.reviewer_id)}` : ''}</b>
            {t.review_note ? <p>“{t.review_note}”</p> : <p className="sub">No note was left.</p>}
          </div>
        )}
        {t.status === 'done' && t.review_note && (
          <div className="review-box ok"><b>Approved{t.reviewer_id ? ` by ${nameOf(t.reviewer_id)}` : ''}</b><p>“{t.review_note}”</p></div>
        )}
        {t.status === 'review' && (
          <div className="review-box">
            <b>Waiting for review from {reviewerLabel(t)}</b>
            {canDecide ? (
              <>
                <textarea rows="3" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback for the team (optional when approving, needed when asking for changes)" />
                <div className="chips">
                  {[...FEEDBACK_OK, ...FEEDBACK_FIX].map((f) => <button type="button" key={f} className="chip" onClick={() => addChip(f)}>{f}</button>)}
                </div>
                <div className="sheet-actions">
                  <button className="btn primary" onClick={() => onDecide('approve', feedback)}>Approve &amp; mark done</button>
                  <button className="btn" onClick={() => onDecide('changes', feedback)}>Request changes</button>
                </div>
              </>
            ) : <p className="sub">You will be notified when they respond.</p>}
          </div>
        )}
        {canRequest && !asking && (
          <button className="btn primary" onClick={() => setAsking(true)}>{t.status === 'changes_requested' ? 'Resubmit for review' : 'Request review'}</button>
        )}
        {canRequest && asking && (
          <div className="review-box">
            <b>Who should review this?</b>
            <select value={reviewer} onChange={(e) => setReviewer(e.target.value)} aria-label="Reviewer">
              {managers.length > 0 && <optgroup label="Managers">{managers.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}</optgroup>}
              {rest.length > 0 && <optgroup label="Team members">{rest.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}</optgroup>}
            </select>
            <textarea rows="2" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything they should know? (optional)" />
            <div className="sheet-actions">
              <button className="btn primary" disabled={!reviewer} onClick={() => { onAskReview(reviewer, message); setAsking(false); setMessage(''); }}>Send for review</button>
              <button className="btn" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="row">
          {field('Urgency', (
            <select value={t.urgency} disabled={!editable} onChange={(e) => onChange({ urgency: e.target.value })}>
              {['low', 'medium', 'high', 'urgent'].map((u) => <option key={u}>{u}</option>)}
            </select>
          ))}
          {field('Assigned to', isManager ? (
            <select value={t.for_team ? 'team' : t.assignee_id || ''} onChange={(e) => onChange({ assignee: e.target.value })}>
              <option value="team">Whole team</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
            </select>
          ) : <input value={t.for_team ? 'Whole team' : nameOf(t.assignee_id)} disabled />)}
        </div>

        <div className="row">
          {field('Start date', <DatePicker label="Start date" value={t.start_date || ''} disabled={!editable} onChange={(v) => onChange({ start_date: v })} />)}
          {field('Deadline', <DatePicker label="Deadline" value={t.deadline || ''} min={t.start_date || undefined} disabled={!editable} onChange={(v) => onChange({ deadline: v })} />)}
        </div>

        {field('Notes', (
          <textarea rows="4" defaultValue={t.notes || ''} disabled={!editable} placeholder="Add details, links, next steps…"
            onBlur={(e) => e.target.value !== (t.notes || '') && onChange({ notes: e.target.value })} />
        ))}

        <div className="fu-box">
          <div className="fu-head"><b>Follow-ups</b>
            {!fuOpen && <button type="button" className="btn sm" onClick={() => setFuOpen(true)}>Ask for a follow-up</button>}</div>
          {fuOpen && (
            <div className="stack">
              <select value={fuTo} onChange={(e) => setFuTo(e.target.value)} aria-label="Ask">
                {members.filter((m) => m.user_id !== userId).map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
              </select>
              <textarea rows="2" value={fuMsg} onChange={(e) => setFuMsg(e.target.value)} placeholder="What should they follow up on? (e.g. Please confirm the BL draft with the shipper)" />
              <div className="row">
                <label>Reply by <span className="sub">(optional)</span><DatePicker label="Reply by" value={fuDue} onChange={setFuDue} /></label>
              </div>
              <div className="sheet-actions">
                <button className="btn primary" disabled={!fuTo} onClick={() => { onAskFollowUp(fuTo, fuMsg, fuDue); setFuOpen(false); setFuMsg(''); setFuDue(''); }}>Send follow-up</button>
                <button className="btn" onClick={() => setFuOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          {followups.length === 0 && !fuOpen && <p className="sub">No follow-ups on this task yet.</p>}
          {followups.map((f) => (
            <div key={f.id} className={`fu-item ${f.status}`}>
              <div><b>{f.from_user === userId ? 'You' : f.from_name || 'Someone'}</b> asked <b>{f.to_user === userId ? 'you' : nameOf(f.to_user)}</b>{f.due_date ? ` · reply by ${fmtDate(f.due_date)}` : ''}</div>
              {f.message && <p>“{f.message}”</p>}
              {f.status === 'done'
                ? <p className="sub">Done{f.reply ? `: “${f.reply}”` : ''}</p>
                : (f.to_user === userId || f.from_user === userId || isManager) && !f.pending && <button className="btn sm" onClick={() => onFinishFollowUp(f.id, '')}>Mark done</button>}
            </div>
          ))}
        </div>

        <div className="sheet-foot">
          <Link href={`/t/${teamId}/tasks/${t.id}`} className="sub"><b>Open full details, follow-up &amp; history →</b></Link>
          {isManager && <button className="btn danger sm" onClick={() => confirm('Delete this task?') && onRemove()}>Delete</button>}
        </div>
      </aside>
    </div>
  );
}

// One follow-up request in the Review tab. The person asked can reply and mark it done.
function FollowRow({ f, task, mine, nameOf, onOpen, onDone }) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  return (
    <div className={`rv-row ${mine ? 'mine' : ''}`}>
      <div className="rv-main-wrap">
        <button type="button" className="rv-main" onClick={onOpen}>
          <span className="rv-title">{task ? task.title : 'Task'}</span>
          <span className="rv-meta">
            <span>{mine ? `${f.from_name || 'Someone'} asked you` : `${f.from_name || 'Someone'} asked ${nameOf(f.to_user)}`}</span>
            <span className={isStale(f.created_at) ? 'stale' : ''}>{ageLabel(f.created_at)} ago</span>
            {f.due_date && <span>reply by {fmtDate(f.due_date)}</span>}
          </span>
          {f.message && <em className="rv-msg">“{f.message}”</em>}
        </button>
        {replying && (
          <div className="rv-reply">
            <input autoFocus value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add a quick reply (optional)"
              onKeyDown={(e) => { if (e.key === 'Enter') onDone(reply); if (e.key === 'Escape') setReplying(false); }} />
            <button className="btn primary sm" onClick={() => onDone(reply)}>Send &amp; done</button>
          </div>
        )}
      </div>
      {mine && !replying && <button type="button" className="btn primary sm" onClick={() => setReplying(true)}>Reply &amp; done</button>}
    </div>
  );
}
