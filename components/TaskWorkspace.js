'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addTaskQuick, patchTaskQuick, removeTaskQuick } from '@/app/actions';
import { STATUS, URGENCY, fmtDate } from '@/lib/util';

const COLS = [
  { id: 'todo', label: 'To do', status: 'todo' },
  { id: 'progress', label: 'In progress', status: 'in_progress' },
  { id: 'done', label: 'Done', status: 'done' },
];
const colOf = (s) => (s === 'todo' ? 'todo' : s === 'done' ? 'done' : 'progress');

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parse = (d) => new Date(`${d}T00:00:00`);
const weekStart = (d) => { const x = parse(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const short = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const initials = (n) => (n || '?').split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const byUrgency = (a, b) => URGENCY[a.urgency] - URGENCY[b.urgency] || (a.deadline || '9999').localeCompare(b.deadline || '9999');

// Search, person filter and view switching all happen in the browser, so they are instant.
export default function TaskWorkspace({ teamId, initialTasks, members, userId, isManager }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState('board');
  const [person, setPerson] = useState(isManager ? 'all' : 'me');
  const [scope, setScope] = useState('open');
  const [group, setGroup] = useState('week');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [leaving, setLeaving] = useState(() => new Set());
  const [err, setErr] = useState('');
  const inflight = useRef(0);
  const today = todayStr();

  useEffect(() => { try { const v = localStorage.getItem('sw-view'); if (v) setView(v); } catch {} }, []);
  const changeView = (v) => { setView(v); try { localStorage.setItem('sw-view', v); } catch {} };

  // Pick up fresh server data (after a refresh) unless a change is still being saved.
  useEffect(() => { if (!inflight.current) setTasks(initialTasks); }, [initialTasks]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !inflight.current) router.refresh(); };
    document.addEventListener('visibilitychange', refresh);
    const id = setInterval(refresh, 45000);
    return () => { document.removeEventListener('visibilitychange', refresh); clearInterval(id); };
  }, [router]);
  useEffect(() => { if (!err) return; const t = setTimeout(() => setErr(''), 4000); return () => clearTimeout(t); }, [err]);

  const nameOf = (id) => { const m = members.find((x) => x.user_id === id); return m ? m.name || m.email : 'Unassigned'; };
  const who = (t) => (t.for_team ? 'Whole team' : t.assignee_id ? nameOf(t.assignee_id) : 'Unassigned');
  const canEdit = (t) => isManager || t.assignee_id === userId || t.created_by === userId || t.for_team;
  const isOver = (t) => !!t.deadline && t.status !== 'done' && t.deadline < today;

  function applyLocal(t, patch) {
    const n = { ...t };
    for (const k of ['title', 'notes', 'urgency', 'deadline', 'status']) if (k in patch) n[k] = patch[k] || (k === 'notes' || k === 'deadline' ? null : n[k]);
    if ('status' in patch) n.completed_at = patch.status === 'done' ? t.completed_at || new Date().toISOString() : null;
    if ('assignee' in patch && isManager) {
      if (patch.assignee === 'team') { n.for_team = true; n.assignee_id = null; } else { n.for_team = false; n.assignee_id = patch.assignee || userId; }
    }
    return n;
  }

  async function change(id, patch) {
    const before = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? applyLocal(t, patch) : t)));
    inflight.current++;
    try {
      const r = await patchTaskQuick({ teamId, id, patch });
      if (!r.ok) { setTasks(before); setErr(r.error || 'Could not save that change'); }
      else if (r.task) setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...r.task } : t)));
    } catch { setTasks(before); setErr('Could not save. Check your connection.'); }
    finally { inflight.current--; }
  }

  async function add(title, colId, assignee) {
    const status = COLS.find((c) => c.id === colId)?.status || 'todo';
    const tmp = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const asg = isManager ? assignee : '';
    setTasks((ts) => [{
      id: tmp, title, notes: null, urgency: 'medium', deadline: null, status, pending: true, created_by: userId,
      for_team: asg === 'team', assignee_id: asg === 'team' ? null : asg || userId, follow_up_date: null,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    }, ...ts]);
    inflight.current++;
    try {
      const r = await addTaskQuick({ teamId, title, status, assignee: asg });
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
  const stats = [
    ['Open', open.length, true],
    ['Overdue', open.filter(isOver).length, false, open.some(isOver) && 'var(--red)'],
    [isManager ? 'To review' : 'In review', open.filter((t) => t.status === 'review').length],
    ['Follow-ups due', open.filter((t) => t.follow_up_date && t.follow_up_date <= today).length],
  ];

  const listed = visible.filter((t) => (scope === 'open' ? t.status !== 'done' : scope === 'done' ? t.status === 'done' : true));
  const selected = tasks.find((t) => t.id === openId);

  /* ---------------- views ---------------- */

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
          {(t.status === 'review' || t.status === 'changes_requested') && <span className={`status ${t.status}`}>{STATUS[t.status]}</span>}
          <span className="av sm" title={who(t)}>{initials(who(t))}</span>
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
        items = col.id === 'done'
          ? items.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
          : items.sort(byUrgency);
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

  const dueLabel = (t) => {
    if (!t.deadline) return '';
    const diff = Math.round((parse(t.deadline) - parse(today)) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0 && t.status !== 'done') return `${-diff}d late`;
    return short(parse(t.deadline));
  };

  const tlRow = (t, showWho = true) => (
    <div key={t.id} className={`tl-row ${t.status === 'done' ? 'is-done' : ''} ${isOver(t) ? 'is-over' : ''}`} onClick={() => setOpenId(t.id)}>
      <span className={`dot c-${colOf(t.status)}`} />
      <div className="tl-title">
        <span className="tt">{t.title}</span>
        {(t.status === 'review' || t.status === 'changes_requested') && <span className={`status ${t.status}`}>{STATUS[t.status]}</span>}
      </div>
      <span className={`tl-urg u-${t.urgency}`}>{t.urgency}</span>
      <span className={`tl-due ${isOver(t) ? 'overdue' : t.deadline === today ? 'now' : ''}`}>{dueLabel(t)}</span>
      {showWho && <span className="av sm" title={who(t)}>{initials(who(t))}</span>}
    </div>
  );

  const timeline = useMemo(() => {
    const rows = listed.slice().sort(byUrgency);
    if (group === 'person') {
      const map = new Map();
      for (const t of rows) {
        const key = t.for_team ? 'team' : t.assignee_id || 'none';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
      }
      return [...map.entries()].map(([key, ts]) => {
        const all = visible.filter((t) => (t.for_team ? 'team' : t.assignee_id || 'none') === key);
        const done = all.filter((t) => t.status === 'done').length;
        return {
          key, kind: 'person', label: key === 'team' ? 'Whole team' : key === 'none' ? 'Unassigned' : nameOf(key),
          done, total: all.length, overdue: ts.filter(isOver).length,
          tasks: ts.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')),
        };
      }).sort((a, b) => b.overdue - a.overdue || a.label.localeCompare(b.label));
    }
    const groups = [];
    const late = rows.filter(isOver);
    if (late.length) groups.push({ key: 'late', kind: 'late', label: 'Overdue', tasks: late.sort((a, b) => a.deadline.localeCompare(b.deadline)) });
    const buckets = new Map();
    for (const t of rows.filter((x) => x.deadline && !isOver(x))) {
      const k = iso(weekStart(t.deadline));
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(t);
    }
    const thisWeek = iso(weekStart(today));
    for (const k of [...buckets.keys()].sort()) {
      const start = parse(k);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const diff = Math.round((start - parse(thisWeek)) / (7 * 864e5));
      groups.push({
        key: k, kind: 'week', tasks: buckets.get(k).sort((a, b) => a.deadline.localeCompare(b.deadline)),
        label: diff === 0 ? 'This week' : diff === 1 ? 'Next week' : `${short(start)} – ${short(end)}`, sub: `${short(start)} – ${short(end)}`,
      });
    }
    const none = rows.filter((t) => !t.deadline);
    if (none.length) groups.push({ key: 'none', kind: 'none', label: 'No deadline', tasks: none });
    return groups;
  }, [listed, group, visible, members, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const timelineView = (
    <div className="tl">
      {timeline.length === 0 && <div className="panel empty">Nothing to show for these filters.</div>}
      {timeline.map((g) => (
        <section key={g.key} className={`tl-group ${g.kind}`}>
          <header className="tl-head">
            {g.kind === 'person' && <span className="av">{initials(g.label)}</span>}
            <h3>{g.label}{g.kind === 'week' && g.label !== g.sub && <span className="sub"> · {g.sub}</span>}</h3>
            <span className="n">{g.tasks.length}</span>
            {g.kind === 'person' && (
              <>
                {g.overdue > 0 && <span className="overdue tl-late">{g.overdue} overdue</span>}
                <span className="tl-prog"><i style={{ width: `${g.total ? Math.round((g.done / g.total) * 100) : 0}%` }} /></span>
                <span className="sub">{g.done}/{g.total} done</span>
              </>
            )}
          </header>
          <div className="tl-rows">{g.tasks.map((t) => tlRow(t, g.kind !== 'person'))}</div>
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

      <div className="ws-bar">
        <div className="tabs" role="tablist">
          {[['board', 'Board'], ['timeline', 'Timeline'], ['list', 'List']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => changeView(k)}>{l}</button>
          ))}
        </div>
        <input className="ws-search" type="search" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ws-person" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
          <option value="all">{isManager ? 'Everyone' : 'Whole team'}</option>
          <option value="me">Assigned to me</option>
          <option value="team">Given to the whole team</option>
          {members.filter((m) => m.user_id !== userId).map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
        </select>
        {view !== 'board' && (
          <div className="seg">
            {[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => (
              <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>
            ))}
          </div>
        )}
        {view === 'timeline' && (
          <div className="seg">
            {[['week', 'By week'], ['person', 'By person']].map(([k, l]) => (
              <button key={k} className={group === k ? 'on' : ''} onClick={() => setGroup(k)}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {view === 'board' ? board : view === 'timeline' ? timelineView : listView}

      {selected && (
        <TaskSheet key={selected.id} task={selected} teamId={teamId} members={members} isManager={isManager}
          editable={canEdit(selected)} onChange={(patch) => change(selected.id, patch)}
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

// Side panel: every field saves as you change it.
function TaskSheet({ task: t, teamId, members, isManager, editable, onChange, onRemove, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const canRequest = editable && ['todo', 'in_progress', 'changes_requested'].includes(t.status);
  const field = (name, label, el) => <label>{label}{el}</label>;

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
        {!editable && <p className="notice">You can view this task, but only its assignee or a manager can change it.</p>}

        <div className="row">
          {field('urgency', 'Urgency', (
            <select value={t.urgency} disabled={!editable} onChange={(e) => onChange({ urgency: e.target.value })}>
              {['low', 'medium', 'high', 'urgent'].map((u) => <option key={u}>{u}</option>)}
            </select>
          ))}
          {field('deadline', 'Deadline', <input type="date" value={t.deadline || ''} disabled={!editable} onChange={(e) => onChange({ deadline: e.target.value })} />)}
        </div>

        {isManager
          ? field('assignee', 'Assigned to', (
            <select value={t.for_team ? 'team' : t.assignee_id || ''} onChange={(e) => onChange({ assignee: e.target.value })}>
              <option value="team">Whole team</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
            </select>))
          : field('assignee', 'Assigned to', <input value={t.for_team ? 'Whole team' : members.find((m) => m.user_id === t.assignee_id)?.name || '—'} disabled />)}

        {field('notes', 'Notes', (
          <textarea rows="5" defaultValue={t.notes || ''} disabled={!editable} placeholder="Add details, links, next steps…"
            onBlur={(e) => e.target.value !== (t.notes || '') && onChange({ notes: e.target.value })} />
        ))}

        <div className="sheet-actions">
          {canRequest && <button className="btn primary" onClick={() => onChange({ status: 'review' })}>Request review</button>}
          {t.status === 'review' && isManager && (
            <>
              <button className="btn primary" onClick={() => onChange({ status: 'done' })}>Approve & mark done</button>
              <button className="btn" onClick={() => onChange({ status: 'changes_requested' })}>Send back</button>
            </>
          )}
          {t.status === 'review' && !isManager && <span className="sub">Waiting for review</span>}
        </div>

        <div className="sheet-foot">
          <Link href={`/t/${teamId}/tasks/${t.id}`} className="sub"><b>Open full details, follow-up &amp; history →</b></Link>
          {isManager && <button className="btn danger sm" onClick={() => confirm('Delete this task?') && onRemove()}>Delete</button>}
        </div>
      </aside>
    </div>
  );
}
