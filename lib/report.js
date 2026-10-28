import { admin } from './admin';
import { sendMail } from './mail';
import { siteUrl } from './site';

const DAY = 864e5;
const iso = (d) => d.toISOString().slice(0, 10);
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// weekly = last 7 days; monthly = the previous calendar month.
export function periodFor(kind) {
  const now = new Date();
  if (kind === 'weekly') return { label: 'Weekly', since: new Date(now - 7 * DAY), until: now };
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  return { label: 'Monthly', since: new Date(Date.UTC(y, m - 1, 1)), until: new Date(Date.UTC(y, m, 1)) };
}

function summarize(tasks, since, until) {
  const inRange = (v) => v && new Date(v) >= since && new Date(v) < until;
  const open = tasks.filter((t) => t.status !== 'done');
  const soon = iso(new Date(Date.now() + 7 * DAY));
  return {
    created: tasks.filter((t) => inRange(t.created_at)),
    completed: tasks.filter((t) => inRange(t.completed_at)),
    open,
    overdue: open.filter((t) => t.deadline && t.deadline < iso(new Date())),
    review: open.filter((t) => t.status === 'review'),
    followUps: open.filter((t) => t.follow_up_date && t.follow_up_date <= soon),
  };
}

const list = (arr) =>
  arr.length
    ? `<ul style="margin:6px 0 0;padding-left:18px">${arr.slice(0, 15).map((t) =>
        `<li>${esc(t.title)}${t.deadline ? ` <span style="color:#888">· due ${t.deadline}</span>` : ''}</li>`).join('')}</ul>`
    : '<p style="color:#888;margin:6px 0 0">None</p>';

const stat = (n, label, color = '#1d1d1b') =>
  `<td style="padding:12px 16px;background:#faf9f5;border-radius:10px;text-align:center"><div style="font-size:26px;font-weight:800;color:${color}">${n}</div><div style="font-size:12px;color:#8a8a84">${label}</div></td>`;

function render({ team, label, since, until, s, perMember, events, link, heading }) {
  const range = `${iso(since)} → ${iso(new Date(until - 1))}`;
  const rows = perMember
    ? `<h3 style="margin:22px 0 6px">By person</h3><table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="text-align:left;color:#8a8a84"><th style="padding:6px 0">Name</th><th>Done</th><th>Open</th><th>Overdue</th></tr>
        ${perMember.map((r) => `<tr style="border-top:1px solid #eee"><td style="padding:8px 0">${esc(r.name)}</td><td>${r.done}</td><td>${r.open}</td><td style="color:${r.overdue ? '#e5484d' : 'inherit'}">${r.overdue}</td></tr>`).join('')}</table>`
    : '';
  const hist = events.length
    ? `<h3 style="margin:22px 0 6px">Activity</h3><ul style="margin:0;padding-left:18px;color:#4a4a46">${events.map((e) => `<li>${esc(e.actor_name || 'Someone')} ${esc(e.type.replace(/_/g, ' '))} — ${esc(e.taskTitle || '')}</li>`).join('')}</ul>`
    : '';
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;color:#1d1d1b">
    <div style="background:#f7c31b;padding:16px 22px;border-radius:14px 14px 0 0"><b style="font-size:18px">Tiger Projects</b></div>
    <div style="border:1px solid #e8e6df;border-top:0;border-radius:0 0 14px 14px;padding:22px">
      <h2 style="margin:0">${label} report · ${esc(team.name)}</h2>
      <p style="color:#8a8a84;margin:4px 0 18px">${heading} · ${range}</p>
      <table cellspacing="8" style="width:100%"><tr>
        ${stat(s.completed.length, 'Completed', '#2f9e63')}${stat(s.created.length, 'Created')}${stat(s.open.length, 'Open')}${stat(s.overdue.length, 'Overdue', s.overdue.length ? '#e5484d' : '#1d1d1b')}
      </tr></table>
      <h3 style="margin:18px 0 0">Completed</h3>${list(s.completed)}
      <h3 style="margin:18px 0 0">Overdue</h3>${list(s.overdue)}
      <h3 style="margin:18px 0 0">Waiting for review</h3>${list(s.review)}
      <h3 style="margin:18px 0 0">Follow-ups due within 7 days</h3>${list(s.followUps)}
      ${rows}${hist}
      <p style="margin-top:26px"><a href="${link}" style="background:#1d1d1b;color:#f7c31b;padding:10px 18px;border-radius:99px;text-decoration:none;font-weight:600">Open Tiger Projects</a></p>
    </div></div>`;
}

export async function sendReports(kind, onlyTeamId) {
  const db = admin();
  const { label, since, until } = periodFor(kind);
  const base = await siteUrl().catch(() => process.env.NEXT_PUBLIC_SITE_URL || '');
  let q = db.from('tp_teams').select('*');
  if (onlyTeamId) q = q.eq('id', onlyTeamId);
  const { data: teams } = await q;
  let sent = 0, skipped = 0;

  for (const team of teams || []) {
    const [{ data: tasks }, { data: members }, { data: events }] = await Promise.all([
      db.from('tp_tasks').select('*').eq('team_id', team.id),
      db.from('tp_members').select('*').eq('team_id', team.id),
      db.from('tp_task_events').select('*').eq('team_id', team.id)
        .gte('created_at', since.toISOString()).lt('created_at', until.toISOString())
        .order('created_at', { ascending: false }).limit(20),
    ]);
    const all = tasks || [];
    const titles = Object.fromEntries(all.map((t) => [t.id, t.title]));
    const evs = (events || []).map((e) => ({ ...e, taskTitle: titles[e.task_id] }));
    const link = `${base}/t/${team.id}`;

    const perMember = (members || []).map((m) => {
      const mine = summarize(all.filter((t) => t.assignee_id === m.user_id), since, until);
      return { name: m.name || m.email, done: mine.completed.length, open: mine.open.length, overdue: mine.overdue.length };
    });

    for (const m of members || []) {
      if (!m.email) continue;
      const isMgr = m.role === 'manager';
      const scope = isMgr ? all : all.filter((t) => t.assignee_id === m.user_id);
      const html = render({
        team, label, since, until, link, events: isMgr ? evs : [],
        s: summarize(scope, since, until),
        perMember: isMgr ? perMember : null,
        heading: isMgr ? 'Whole team' : 'Your tasks',
      });
      const r = await sendMail({ to: m.email, subject: `${label} task report — ${team.name}`, html });
      r.ok ? sent++ : skipped++;
    }
  }
  return { sent, skipped };
}
