import { admin } from './admin';
import { sendMail } from './mail';
import { siteUrl } from './site';

const DAY = 864e5;
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ageDays = (ts) => (ts ? Math.floor((Date.now() - new Date(ts)) / DAY) : 0);
const ageLabel = (ts) => { const d = ageDays(ts); return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`; };

const list = (items) => items.length
  ? `<ul style="margin:6px 0 0;padding-left:18px">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
  : '<p style="color:#888;margin:6px 0 0">Nothing</p>';

// Daily reminder: everyone is told what is waiting on them; managers also see everything pending across the team.
export async function sendPendingDigest() {
  const db = admin();
  const base = await siteUrl().catch(() => process.env.NEXT_PUBLIC_SITE_URL || '');
  const { data: teams } = await db.from('tp_teams').select('id, name');
  let sent = 0, skipped = 0;

  for (const team of teams || []) {
    const [{ data: tasks }, { data: members }, { data: followups }] = await Promise.all([
      db.from('tp_tasks').select('*').eq('team_id', team.id).eq('status', 'review'),
      db.from('tp_members').select('*').eq('team_id', team.id),
      db.from('tp_followups').select('*').eq('team_id', team.id).eq('status', 'open'),
    ]);
    const reviews = tasks || [];
    const opens = followups || [];
    if (!reviews.length && !opens.length) continue;

    const people = members || [];
    const managers = people.filter((m) => m.role === 'manager');
    const nameOf = (id) => people.find((m) => m.user_id === id)?.name || 'someone';
    const taskTitle = Object.fromEntries(
      (await db.from('tp_tasks').select('id, title').in('id', [...new Set(opens.map((f) => f.task_id))])).data?.map((t) => [t.id, t.title]) || [],
    );

    const reviewLine = (t) => `<b>${esc(t.title)}</b> · waiting ${ageLabel(t.review_requested_at || t.updated_at)}${ageDays(t.review_requested_at || t.updated_at) >= 2 ? ' ⚠️' : ''}`;
    const followLine = (f) => `<b>${esc(taskTitle[f.task_id] || 'Task')}</b> · ${esc(f.from_name || 'Someone')} asked${f.message ? `: “${esc(f.message)}”` : ''} · ${ageLabel(f.created_at)}${f.due_date ? ` · due ${f.due_date}` : ''}`;

    for (const m of people) {
      if (!m.email) continue;
      const myReviews = reviews.filter((t) => t.reviewer_id === m.user_id || (m.role === 'manager' && !t.reviewer_id));
      const myFollow = opens.filter((f) => f.to_user === m.user_id);
      const others = m.role === 'manager'
        ? { reviews: reviews.filter((t) => !myReviews.includes(t)), follow: opens.filter((f) => f.to_user !== m.user_id) }
        : { reviews: [], follow: [] };
      if (!myReviews.length && !myFollow.length && !others.reviews.length && !others.follow.length) continue;

      const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;color:#1d1d1b">
        <div style="background:#2b214a;padding:16px 22px;border-radius:14px 14px 0 0"><b style="font-size:18px;color:#fff">Stableworks</b></div>
        <div style="border:1px solid #e8e6df;border-top:0;border-radius:0 0 14px 14px;padding:22px">
          <h2 style="margin:0">Waiting on you · ${esc(team.name)}</h2>
          <h3 style="margin:18px 0 0">Reviews for you (${myReviews.length})</h3>${list(myReviews.map(reviewLine))}
          <h3 style="margin:18px 0 0">Follow-ups for you (${myFollow.length})</h3>${list(myFollow.map(followLine))}
          ${m.role === 'manager' && (others.reviews.length || others.follow.length) ? `
            <h3 style="margin:22px 0 0">Also pending across the team</h3>
            <p style="color:#8a8a84;margin:4px 0 0">With other people. Worth a nudge if something has been waiting for days.</p>
            ${list([
              ...others.reviews.map((t) => `${reviewLine(t)} · reviewer ${esc(t.reviewer_id ? nameOf(t.reviewer_id) : 'not chosen')}`),
              ...others.follow.map((f) => `${followLine(f)} · for ${esc(nameOf(f.to_user))}`),
            ])}` : ''}
          <p style="margin-top:26px"><a href="${base}/t/${team.id}" style="background:#2b214a;color:#fff;padding:10px 18px;border-radius:99px;text-decoration:none;font-weight:600">Open the Review tab</a></p>
        </div></div>`;
      const r = await sendMail({ to: m.email, subject: `Pending reviews and follow-ups · ${team.name}`, html });
      r.ok ? sent++ : skipped++;
    }
  }
  return { sent, skipped };
}
