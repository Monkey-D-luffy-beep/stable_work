'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { admin } from '@/lib/admin';
import { getUser, getTeamCtx } from '@/lib/ctx';
import { sendMail } from '@/lib/mail';
import { siteUrl } from '@/lib/site';
import { sendReports } from '@/lib/report';
import { PRESETS } from '@/lib/presets';
import { STATUS } from '@/lib/util';
import { cleanRow, parseSheet } from '@/lib/dsr';
import { isAvatar, defaultAvatar } from '@/lib/avatars';

const str = (fd, k) => (fd.get(k) || '').toString().trim();
const enc = encodeURIComponent;

/* ---------- auth ---------- */

export async function login(fd) {
  const email = str(fd, 'email').toLowerCase();
  const next = str(fd, 'next') || '/';
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=${enc(next)}`, data: { app: 'stableworks' } },
  });
  if (error) redirect(`/login?error=${enc(error.message)}&next=${enc(next)}`);
  redirect(`/login?sent=${enc(email)}`);
}

const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

// Password sign-in: no email is sent, so Supabase's email rate limit does not apply.
export async function signInPassword(fd) {
  const next = safeNext(str(fd, 'next'));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: str(fd, 'email').toLowerCase(), password: fd.get('password') || '' });
  if (error) redirect(`/login?mode=signin&error=${enc(error.message)}&next=${enc(next)}`);
  redirect(next);
}

export async function signUpPassword(fd) {
  const next = safeNext(str(fd, 'next'));
  const email = str(fd, 'email').toLowerCase();
  const password = (fd.get('password') || '').toString();
  const fail = (m) => redirect(`/login?mode=signup&error=${enc(m)}&next=${enc(next)}`);
  if (password.length < 8) fail('Password must be at least 8 characters');
  // Created pre-confirmed through the admin API so no confirmation email is needed.
  const { error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { app: 'stableworks', avatar: defaultAvatar(email) } });
  if (error) fail(/already|registered|exists/i.test(error.message) ? 'That email already has an account. Use Sign in.'
    : /database error/i.test(error.message) ? 'Could not create the account: the shared database rejected a new user. See the setup note, or ask for the sign-up rule to be fixed.'
    : error.message);
  const sb = await supabaseServer();
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
  if (e2) fail(e2.message);
  redirect(next);
}

export async function logout() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect('/login');
}

/* ---------- teams ---------- */

async function saveAvatar(teamId, fd) {
  const file = fd.get('picture');
  if (file && typeof file === 'object' && file.size > 0) {
    if (!file.type.startsWith('image/') || file.size > 3 * 1024 * 1024) return { error: 'Picture must be an image under 3 MB' };
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${teamId}/${Date.now()}.${ext}`;
    const db = admin();
    const { error } = await db.storage.from('team-pictures').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (error) return { error: error.message };
    return { avatar: db.storage.from('team-pictures').getPublicUrl(path).data.publicUrl };
  }
  const preset = str(fd, 'preset');
  return { avatar: PRESETS.some((p) => p.id === preset) ? preset : undefined };
}

// Writes a membership row; if the avatar column has not been added yet it falls back to saving without it.
async function saveMember(db, row, opts) {
  let r = await db.from('tp_members').upsert(row, opts);
  if (r.error && /avatar/i.test(r.error.message)) {
    const { avatar, ...rest } = row;
    r = await db.from('tp_members').upsert(rest, opts);
  }
  return r;
}
const avatarFor = (user) => user.user_metadata?.avatar || defaultAvatar(user.email);
const displayName = (user) => user.user_metadata?.full_name || user.email.split('@')[0];

const parseEmails = (raw) => [...new Set(raw.toLowerCase().split(/[\s,;]+/).filter((e) => /^\S+@\S+\.\S+$/.test(e)))];

// Creates invites (skipping people already in the team or already invited) and emails each one.
async function sendInvites(db, team, inviterName, emails, role) {
  if (!emails.length) return { created: 0, mailed: 0 };
  const [{ data: members }, { data: pending }] = await Promise.all([
    db.from('tp_members').select('email').eq('team_id', team.id),
    db.from('tp_invites').select('email').eq('team_id', team.id).is('accepted_at', null),
  ]);
  const skip = new Set([...(members || []), ...(pending || [])].map((r) => r.email?.toLowerCase()));
  const fresh = emails.filter((e) => !skip.has(e));
  if (!fresh.length) return { created: 0, mailed: 0 };
  const { data: rows } = await db.from('tp_invites')
    .insert(fresh.map((email) => ({ team_id: team.id, email, role }))).select('email, token');
  const base = await siteUrl();
  const sent = await Promise.all((rows || []).map((r) => sendMail({
    to: r.email,
    subject: `${inviterName} invited you to ${team.name} on Stableworks`,
    html: `<p>${inviterName} invited you to join <b>${team.name}</b> as ${role}.</p><p><a href="${base}/join?token=${r.token}">Accept invite</a></p>`,
  })));
  return { created: rows?.length || 0, mailed: sent.filter((s) => s.ok).length };
}

export async function createTeam(fd) {
  const { user } = await getUser();
  const name = str(fd, 'name');
  if (!name) redirect('/teams/new?error=Give+the+team+a+name');
  const db = admin();

  // A double-click must not create a second team: reuse one made in the last 30 seconds.
  const { data: recent } = await db.from('tp_teams').select('id').eq('created_by', user.id).eq('name', name)
    .gte('created_at', new Date(Date.now() - 30000).toISOString()).limit(1);
  if (recent?.length) redirect(`/t/${recent[0].id}`);

  const { data: team, error } = await db.from('tp_teams')
    .insert({ name, description: str(fd, 'description') || null, created_by: user.id }).select().single();
  if (error) redirect(`/teams/new?error=${enc(error.message)}`);
  const pic = await saveAvatar(team.id, fd);
  await db.from('tp_teams').update({ join_token: newToken() }).eq('id', team.id);
  await Promise.all([
    pic.avatar ? db.from('tp_teams').update({ avatar: pic.avatar }).eq('id', team.id) : null,
    saveMember(db, {
      team_id: team.id, user_id: user.id, role: 'manager', email: user.email, name: displayName(user), avatar: avatarFor(user),
    }),
  ]);
  const inv = await sendInvites(db, team, user.email.split('@')[0], parseEmails(str(fd, 'emails')), 'member');
  redirect(`/t/${team.id}/members?msg=${enc(inv.created ? `Team created. ${inv.created} invite(s) sent.` : 'Team created. Share the join link below to bring your people in.')}#invite-link`);
}

export async function updateTeam(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  const patch = { name: str(fd, 'name') || ctx.team.name, description: str(fd, 'description') || null };
  const pic = await saveAvatar(ctx.team.id, fd);
  if (pic.error) redirect(`/t/${ctx.team.id}/members?msg=${enc(pic.error)}`);
  if (pic.avatar) patch.avatar = pic.avatar;
  await admin().from('tp_teams').update(patch).eq('id', ctx.team.id);
  revalidatePath(`/t/${ctx.team.id}`, 'layout');
  redirect(`/t/${ctx.team.id}/members?msg=Team+updated`);
}

export async function inviteMembers(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  const role = str(fd, 'role') === 'manager' ? 'manager' : 'member';
  const emails = parseEmails(str(fd, 'emails'));
  if (!emails.length) redirect(`/t/${ctx.team.id}/members?msg=Enter+at+least+one+valid+email`);
  const { created, mailed } = await sendInvites(admin(), ctx.team, ctx.name, emails, role);
  revalidatePath(`/t/${ctx.team.id}/members`);
  const note = created ? `${created} invite(s) created, ${mailed} emailed. Pending links are listed below.` : 'Everyone you entered is already in the team or invited.';
  redirect(`/t/${ctx.team.id}/members?msg=${enc(note)}`);
}

export async function acceptInvite(fd) {
  const { user } = await getUser();
  const db = admin();
  const { data: inv } = await db.from('tp_invites').select('*').eq('token', str(fd, 'token')).is('accepted_at', null).maybeSingle();
  if (!inv) redirect('/?msg=Invite+not+found+or+already+used');
  if (inv.email.toLowerCase() !== user.email.toLowerCase())
    redirect(`/join?token=${inv.token}&error=${enc(`This invite is for ${inv.email}. Sign in with that email.`)}`);
  await saveMember(db, {
    team_id: inv.team_id, user_id: user.id, role: inv.role, email: user.email, name: displayName(user), avatar: avatarFor(user),
  });
  await db.from('tp_invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);
  redirect(`/t/${inv.team_id}`);
}

// Permanently deletes the team with its members, invites, tasks and history (all cascade).
export async function deleteTeam(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  if (str(fd, 'confirm') !== ctx.team.name)
    redirect(`/t/${ctx.team.id}/members?msg=${enc('Team not deleted: the name you typed did not match')}`);
  const db = admin();
  const { data: files } = await db.storage.from('team-pictures').list(ctx.team.id);
  if (files?.length) await db.storage.from('team-pictures').remove(files.map((f) => `${ctx.team.id}/${f.name}`));
  const { error } = await db.from('tp_teams').delete().eq('id', ctx.team.id);
  if (error) redirect(`/t/${ctx.team.id}/members?msg=${enc(error.message)}`);
  redirect(`/?msg=${enc(`Team "${ctx.team.name}" deleted`)}`);
}

export async function removeMember(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  const uid = str(fd, 'userId');
  if (!ctx.isManager || uid === ctx.user.id) return;
  await admin().from('tp_members').delete().eq('team_id', ctx.team.id).eq('user_id', uid);
  revalidatePath(`/t/${ctx.team.id}/members`);
}

export async function revokeInvite(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  await ctx.sb.from('tp_invites').delete().eq('id', str(fd, 'id'));
  revalidatePath(`/t/${ctx.team.id}/members`);
}

export async function sendReportNow(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  const kind = str(fd, 'kind') === 'monthly' ? 'monthly' : 'weekly';
  const r = await sendReports(kind, ctx.team.id);
  redirect(`/t/${ctx.team.id}/members?msg=${enc(`${kind} report: ${r.sent} sent, ${r.skipped} not sent (check RESEND_API_KEY / sender domain)`)}`);
}

/* ---------- tasks ---------- */

async function log(ctx, taskId, type, detail) {
  await ctx.sb.from('tp_task_events').insert({
    task_id: taskId, team_id: ctx.team.id, actor_id: ctx.user.id, actor_name: ctx.name, type, detail: detail || null,
  });
}

async function memberList(ctx) {
  const { data } = await ctx.sb.from('tp_members').select('user_id, name, email, role').eq('team_id', ctx.team.id);
  return data || [];
}

// "team" => whole team, uuid => person. Members can only assign to themselves.
function resolveAssignee(ctx, raw) {
  if (!ctx.isManager) return { assignee_id: ctx.user.id, for_team: false };
  if (raw === 'team') return { assignee_id: null, for_team: true };
  return { assignee_id: raw || ctx.user.id, for_team: false };
}

export async function createTask(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  const title = str(fd, 'title');
  if (!title) return;
  // Ignore an identical task created moments ago (double-click / retry).
  const { data: dupe } = await ctx.sb.from('tp_tasks').select('id').eq('team_id', ctx.team.id)
    .eq('created_by', ctx.user.id).eq('title', title)
    .gte('created_at', new Date(Date.now() - 15000).toISOString()).limit(1);
  if (dupe?.length) return;
  const { data: t } = await ctx.sb.from('tp_tasks').insert({
    team_id: ctx.team.id, title, notes: str(fd, 'notes') || null,
    urgency: str(fd, 'urgency') || 'medium', deadline: str(fd, 'deadline') || null,
    created_by: ctx.user.id, ...resolveAssignee(ctx, str(fd, 'assignee')),
  }).select().single();
  if (t) {
    const who = t.for_team ? 'the whole team' : (await memberList(ctx)).find((m) => m.user_id === t.assignee_id)?.name || 'someone';
    await log(ctx, t.id, 'created', `Assigned to ${who}`);
  }
  revalidatePath(`/t/${ctx.team.id}`);
}

export async function updateTask(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  const id = str(fd, 'id');
  const { data: old } = await ctx.sb.from('tp_tasks').select('*').eq('id', id).single();
  if (!old) return;
  const patch = {
    title: str(fd, 'title') || old.title,
    notes: str(fd, 'notes') || null,
    urgency: str(fd, 'urgency') || old.urgency,
    deadline: str(fd, 'deadline') || null,
    status: str(fd, 'status') || old.status,
    updated_at: new Date().toISOString(),
  };
  if (ctx.isManager) Object.assign(patch, resolveAssignee(ctx, str(fd, 'assignee')));
  patch.completed_at = patch.status === 'done' ? old.completed_at || new Date().toISOString() : null;

  const members = await memberList(ctx);
  const who = (t) => (t.for_team ? 'Whole team' : members.find((m) => m.user_id === t.assignee_id)?.name || 'Unassigned');
  const changes = [];
  if (patch.title !== old.title) changes.push(`title → ${patch.title}`);
  if (patch.urgency !== old.urgency) changes.push(`urgency ${old.urgency} → ${patch.urgency}`);
  if ((patch.deadline || null) !== (old.deadline || null)) changes.push(`deadline ${old.deadline || 'none'} → ${patch.deadline || 'none'}`);
  if (patch.status !== old.status) changes.push(`status ${STATUS[old.status]} → ${STATUS[patch.status]}`);
  if (ctx.isManager && who({ ...old }) !== who(patch)) changes.push(`assigned ${who(old)} → ${who(patch)}`);
  if ((patch.notes || '') !== (old.notes || '')) changes.push('notes edited');

  await ctx.sb.from('tp_tasks').update(patch).eq('id', id);
  if (changes.length) await log(ctx, id, 'updated', changes.join('; '));
  revalidatePath(`/t/${ctx.team.id}`, 'layout');
  redirect(`/t/${ctx.team.id}/tasks/${id}`);
}

export async function requestReview(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  const id = str(fd, 'id');
  const comment = str(fd, 'comment');
  const { data: t } = await ctx.sb.from('tp_tasks').update({
    status: 'review', review_requested_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  await log(ctx, id, 'review_requested', comment);
  const members = await memberList(ctx);
  const base = await siteUrl();
  for (const m of members.filter((x) => x.role === 'manager' && x.email)) {
    await sendMail({
      to: m.email,
      subject: `Review requested: ${t?.title}`,
      html: `<p>${ctx.name} asked for a review of <b>${t?.title}</b>.</p>${comment ? `<p>“${comment}”</p>` : ''}<p><a href="${base}/t/${ctx.team.id}/tasks/${id}">Open task</a></p>`,
    });
  }
  revalidatePath(`/t/${ctx.team.id}`, 'layout');
  redirect(`/t/${ctx.team.id}/tasks/${id}`);
}

export async function reviewDecision(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  const id = str(fd, 'id');
  const approve = str(fd, 'decision') === 'approve';
  const comment = str(fd, 'comment');
  const now = new Date().toISOString();
  const { data: t } = await ctx.sb.from('tp_tasks').update(
    approve ? { status: 'done', completed_at: now, updated_at: now } : { status: 'changes_requested', completed_at: null, updated_at: now }
  ).eq('id', id).select().single();
  await log(ctx, id, approve ? 'review_approved' : 'changes_requested', comment);
  const assignee = t?.assignee_id && (await memberList(ctx)).find((m) => m.user_id === t.assignee_id);
  if (assignee?.email)
    await sendMail({
      to: assignee.email,
      subject: `${approve ? 'Approved' : 'Changes requested'}: ${t.title}`,
      html: `<p>${ctx.name} ${approve ? 'approved' : 'asked for changes on'} <b>${t.title}</b>.</p>${comment ? `<p>“${comment}”</p>` : ''}<p><a href="${await siteUrl()}/t/${ctx.team.id}/tasks/${id}">Open task</a></p>`,
    });
  revalidatePath(`/t/${ctx.team.id}`, 'layout');
  redirect(`/t/${ctx.team.id}/tasks/${id}`);
}

export async function setFollowUp(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  const id = str(fd, 'id');
  const date = str(fd, 'date') || null;
  const note = str(fd, 'note') || null;
  await ctx.sb.from('tp_tasks').update({ follow_up_date: date, follow_up_note: date ? note : null }).eq('id', id);
  await log(ctx, id, date ? 'follow_up_set' : 'follow_up_cleared', date ? `${date}${note ? ` — ${note}` : ''}` : '');
  revalidatePath(`/t/${ctx.team.id}`, 'layout');
  redirect(`/t/${ctx.team.id}/tasks/${id}`);
}

export async function addNote(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  const id = str(fd, 'id');
  const text = str(fd, 'text');
  if (text) await log(ctx, id, 'note', text);
  revalidatePath(`/t/${ctx.team.id}/tasks/${id}`);
}

export async function deleteTask(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  await ctx.sb.from('tp_tasks').delete().eq('id', str(fd, 'id'));
  if (str(fd, 'stay')) return revalidatePath(`/t/${ctx.team.id}`);
  redirect(`/t/${ctx.team.id}`);
}

/* ---------- DSR (shipments) ---------- */

const rawFromForm = (fd) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));

export async function createShipment(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  const row = cleanRow(rawFromForm(fd));
  if (!row.mbl && !row.hbl && !row.trl_no && !row.shipper_name) return;
  // Ignore an identical shipment created moments ago (double-click / retry).
  if (row.mbl || row.hbl) {
    let q = ctx.sb.from('tp_shipments').select('id').eq('team_id', ctx.team.id)
      .gte('created_at', new Date(Date.now() - 15000).toISOString()).limit(1);
    q = row.mbl ? q.eq('mbl', row.mbl) : q.is('mbl', null);
    q = row.hbl ? q.eq('hbl', row.hbl) : q.is('hbl', null);
    const { data: dupe } = await q;
    if (dupe?.length) return;
  }
  await ctx.sb.from('tp_shipments').insert({ ...row, team_id: ctx.team.id, created_by: ctx.user.id });
  revalidatePath(`/t/${ctx.team.id}/dsr`);
}

export async function updateShipment(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  await ctx.sb.from('tp_shipments')
    .update({ ...cleanRow(rawFromForm(fd)), updated_at: new Date().toISOString() })
    .eq('id', str(fd, 'id')).eq('team_id', ctx.team.id);
  revalidatePath(`/t/${ctx.team.id}/dsr`);
  redirect(`/t/${ctx.team.id}/dsr`);
}

export async function deleteShipment(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  await ctx.sb.from('tp_shipments').delete().eq('id', str(fd, 'id')).eq('team_id', ctx.team.id);
  if (str(fd, 'stay')) return revalidatePath(`/t/${ctx.team.id}/dsr`);
  redirect(`/t/${ctx.team.id}/dsr`);
}

// Paste rows straight from Excel / Google Sheets (with or without the header row).
export async function importShipments(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  const rows = parseSheet(fd.get('sheet'));
  const back = (m) => redirect(`/t/${ctx.team.id}/dsr?msg=${enc(m)}`);
  if (!rows.length) back('Nothing to import. Paste rows copied from your sheet, including the header row.');
  if (rows.length > 500) back('Import up to 500 rows at a time.');
  const { error } = await ctx.sb.from('tp_shipments').insert(rows.map((r) => ({ ...r, team_id: ctx.team.id, created_by: ctx.user.id })));
  if (error) back(`Import failed: ${error.message}`);
  revalidatePath(`/t/${ctx.team.id}/dsr`);
  back(`Imported ${rows.length} shipment${rows.length === 1 ? '' : 's'}.`);
}

/* ---------- fast task actions: no redirect or page reload, the client updates itself ---------- */

const URGENCIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = Object.keys(STATUS);

export async function addTaskQuick({ teamId, title, status = 'todo', urgency = 'medium', deadline = null, start_date = null, assignee = '' }) {
  const ctx = await getTeamCtx(teamId);
  title = String(title || '').trim();
  if (!title) return { ok: false, error: 'Give the task a title' };
  if (!STATUSES.includes(status)) status = 'todo';
  const now = new Date().toISOString();

  // Ignore an identical task created moments ago (double-click / retry).
  const { data: dupe } = await ctx.sb.from('tp_tasks').select('*').eq('team_id', ctx.team.id)
    .eq('created_by', ctx.user.id).eq('title', title).gte('created_at', new Date(Date.now() - 4000).toISOString()).limit(1);
  if (dupe?.length) return { ok: true, task: dupe[0] };

  const { data, error } = await ctx.sb.from('tp_tasks').insert({
    team_id: ctx.team.id, title, status, created_by: ctx.user.id,
    urgency: URGENCIES.includes(urgency) ? urgency : 'medium', deadline: deadline || null,
    completed_at: status === 'done' ? now : null, ...(start_date ? { start_date } : {}), ...resolveAssignee(ctx, assignee),
  }).select().single();
  if (error) return { ok: false, error: error.message };
  await log(ctx, data.id, 'created', data.for_team ? 'Assigned to the whole team' : null);
  return { ok: true, task: data };
}

export async function patchTaskQuick({ teamId, id, patch = {} }) {
  const ctx = await getTeamCtx(teamId);
  const { data: old } = await ctx.sb.from('tp_tasks').select('*').eq('id', id).maybeSingle();
  if (!old) return { ok: false, error: 'Task not found' };

  const next = {};
  const changes = [];
  if ('title' in patch) {
    const v = String(patch.title || '').trim();
    if (v && v !== old.title) { next.title = v; changes.push(`title → ${v}`); }
  }
  if ('notes' in patch) {
    const v = String(patch.notes || '').trim() || null;
    if (v !== (old.notes || null)) { next.notes = v; changes.push('notes edited'); }
  }
  if ('urgency' in patch && URGENCIES.includes(patch.urgency) && patch.urgency !== old.urgency) {
    next.urgency = patch.urgency; changes.push(`urgency ${old.urgency} → ${patch.urgency}`);
  }
  if ('deadline' in patch) {
    const v = patch.deadline || null;
    if (v !== (old.deadline || null)) { next.deadline = v; changes.push(`deadline ${old.deadline || 'none'} → ${v || 'none'}`); }
  }
  if ('start_date' in patch) {
    const v = patch.start_date || null;
    if (v !== (old.start_date || null)) { next.start_date = v; changes.push(`start ${old.start_date || 'none'} → ${v || 'none'}`); }
  }
  if ('assignee' in patch && ctx.isManager) {
    const a = resolveAssignee(ctx, patch.assignee);
    if (a.assignee_id !== old.assignee_id || a.for_team !== old.for_team) { Object.assign(next, a); changes.push('reassigned'); }
  }
  let review = null;
  if ('status' in patch && STATUSES.includes(patch.status) && patch.status !== old.status) {
    next.status = patch.status;
    next.completed_at = patch.status === 'done' ? old.completed_at || new Date().toISOString() : null;
    if (patch.status === 'review') review = 'review_requested';
    else if (old.status === 'review' && patch.status === 'done') review = 'review_approved';
    else if (old.status === 'review' && ['in_progress', 'changes_requested', 'todo'].includes(patch.status) && ctx.isManager) review = 'changes_requested';
    else changes.push(`status ${STATUS[old.status]} → ${STATUS[patch.status]}`);
    if (next.status === 'review') next.review_requested_at = new Date().toISOString();
  }
  if (!Object.keys(next).length) return { ok: true, task: old };

  next.updated_at = new Date().toISOString();
  const { data, error } = await ctx.sb.from('tp_tasks').update(next).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };

  if (changes.length) await log(ctx, id, 'updated', changes.join('; '));
  if (review) await log(ctx, id, review, null);

  if (review === 'review_requested') {
    const base = await siteUrl();
    for (const m of (await memberList(ctx)).filter((x) => x.role === 'manager' && x.email && x.user_id !== ctx.user.id)) {
      await sendMail({
        to: m.email, subject: `Review requested: ${data.title}`,
        html: `<p>${ctx.name} asked for a review of <b>${data.title}</b>.</p><p><a href="${base}/t/${ctx.team.id}/tasks/${id}">Open task</a></p>`,
      });
    }
  }
  return { ok: true, task: data };
}

export async function removeTaskQuick({ teamId, id }) {
  const ctx = await getTeamCtx(teamId);
  if (!ctx.isManager) return { ok: false, error: 'Only managers can delete tasks' };
  const { error } = await ctx.sb.from('tp_tasks').delete().eq('id', id).eq('team_id', ctx.team.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ---------- quick join link ---------- */

const newToken = () => crypto.randomUUID().replace(/-/g, '').slice(0, 18);

// Create or replace the team's join link. The old link stops working immediately.
export async function rotateJoinLink(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  const { error } = await admin().from('tp_teams').update({ join_token: newToken(), join_enabled: true }).eq('id', ctx.team.id);
  revalidatePath(`/t/${ctx.team.id}/members`);
  if (error) redirect(`/t/${ctx.team.id}/members?msg=${enc('Run supabase/join-link.sql in the SQL editor first.')}`);
}

export async function toggleJoinLink(fd) {
  const ctx = await getTeamCtx(str(fd, 'teamId'));
  if (!ctx.isManager) return;
  await admin().from('tp_teams').update({ join_enabled: str(fd, 'enable') === '1' }).eq('id', ctx.team.id);
  revalidatePath(`/t/${ctx.team.id}/members`);
}

async function teamForToken(token) {
  if (!token) return null;
  const { data } = await admin().from('tp_teams').select('*').eq('join_token', token).eq('join_enabled', true).maybeSingle();
  return data;
}

// A brand-new person: create the account, sign in and join the team in one step.
export async function joinWithNewAccount(fd) {
  const token = str(fd, 'token');
  const back = (m) => redirect(`/j/${token}?error=${enc(m)}`);
  const team = await teamForToken(token);
  if (!team) back('This invite link is no longer active. Ask for a new one.');
  const name = str(fd, 'name');
  const email = str(fd, 'email').toLowerCase();
  const password = (fd.get('password') || '').toString();
  if (!name) back('Please enter your name');
  if (!/^\S+@\S+\.\S+$/.test(email)) back('Please enter a valid email');
  if (password.length < 8) back('Password must be at least 8 characters');

  const picked = str(fd, 'avatar');
  const avatar = isAvatar(picked) ? picked : defaultAvatar(email);
  const db = admin();
  const { data: created, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { app: 'stableworks', full_name: name, avatar },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message))
      redirect(`/login?mode=signin&next=${enc(`/j/${token}`)}&error=${enc('You already have an account. Sign in to join the team.')}`);
    back(error.message);
  }
  const sb = await supabaseServer();
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
  if (e2) back(e2.message);
  await saveMember(db, { team_id: team.id, user_id: created.user.id, role: 'member', email, name, avatar });
  redirect(`/t/${team.id}?welcome=1`);
}

// Someone who is already signed in opens the link: one click to join.
export async function joinAsCurrentUser(fd) {
  const token = str(fd, 'token');
  const { user } = await getUser();
  const team = await teamForToken(token);
  if (!team) redirect(`/j/${token}?error=${enc('This invite link is no longer active.')}`);
  await saveMember(admin(),
    { team_id: team.id, user_id: user.id, role: 'member', email: user.email, name: displayName(user), avatar: avatarFor(user) },
    { onConflict: 'team_id,user_id', ignoreDuplicates: true });
  redirect(`/t/${team.id}?welcome=1`);
}

/* ---------- profile ---------- */

export async function updateProfile(fd) {
  const { user } = await getUser();
  const name = str(fd, 'name');
  const picked = str(fd, 'avatar');
  const avatar = isAvatar(picked) ? picked : defaultAvatar(user.email);
  const db = admin();
  await db.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, ...(name ? { full_name: name } : {}), avatar },
  });
  if (name) await db.from('tp_members').update({ name }).eq('user_id', user.id);
  const r = await db.from('tp_members').update({ avatar }).eq('user_id', user.id);
  revalidatePath('/', 'layout');
  redirect(`/profile?msg=${enc(r.error ? 'Saved your name. Run supabase/avatars.sql to switch on pictures everywhere.' : 'Profile updated')}`);
}

/* ---------- reviews: pick a reviewer, then approve or send back with feedback ---------- */

// Runs an update; if the review columns have not been added yet, retries without them.
async function updateTaskSafe(ctx, id, next) {
  let r = await ctx.sb.from('tp_tasks').update(next).eq('id', id).select().single();
  if (r.error && /reviewer_id|review_note|start_date/i.test(r.error.message)) {
    const { reviewer_id, review_note, start_date, ...rest } = next;
    r = await ctx.sb.from('tp_tasks').update(rest).eq('id', id).select().single();
    if (!r.error) r.fallback = true;
  }
  return r;
}

export async function requestReviewQuick({ teamId, id, reviewer = '', message = '' }) {
  const ctx = await getTeamCtx(teamId);
  const members = await memberList(ctx);
  const rev = members.find((m) => m.user_id === reviewer);
  if (!rev) return { ok: false, error: 'Choose who should review this' };
  message = String(message || '').trim();

  const now = new Date().toISOString();
  const r = await updateTaskSafe(ctx, id, {
    status: 'review', reviewer_id: rev.user_id, review_requested_at: now, review_note: null, completed_at: null, updated_at: now,
  });
  if (r.error) return { ok: false, error: r.error.message };
  await log(ctx, id, 'review_requested', `${message ? message + ' — ' : ''}reviewer: ${rev.name || rev.email}`);

  if (rev.email && rev.user_id !== ctx.user.id) {
    const base = await siteUrl();
    await sendMail({
      to: rev.email, subject: `Review requested: ${r.data.title}`,
      html: `<p>${ctx.name} asked you to review <b>${r.data.title}</b>.</p>${message ? `<p>“${message}”</p>` : ''}<p><a href="${base}/t/${ctx.team.id}">Open the task</a></p>`,
    });
  }
  return { ok: true, task: r.data };
}

export async function decideReviewQuick({ teamId, id, decision, feedback = '' }) {
  const ctx = await getTeamCtx(teamId);
  const { data: old } = await ctx.sb.from('tp_tasks').select('*').eq('id', id).maybeSingle();
  if (!old) return { ok: false, error: 'Task not found' };
  if (old.status !== 'review') return { ok: false, error: 'This task is not waiting for review' };
  if (!ctx.isManager && old.reviewer_id !== ctx.user.id) return { ok: false, error: 'Only the chosen reviewer or a manager can decide this review' };

  const approve = decision === 'approve';
  feedback = String(feedback || '').trim();
  if (!approve && !feedback) return { ok: false, error: 'Add a short note so they know what to change' };

  const now = new Date().toISOString();
  const r = await updateTaskSafe(ctx, id, approve
    ? { status: 'done', completed_at: now, review_note: feedback || null, updated_at: now }
    : { status: 'changes_requested', completed_at: null, review_note: feedback, updated_at: now });
  if (r.error) return { ok: false, error: r.error.message };
  await log(ctx, id, approve ? 'review_approved' : 'changes_requested', feedback || null);

  const members = await memberList(ctx);
  const base = await siteUrl();
  const notify = new Set([old.assignee_id, old.created_by].filter((u) => u && u !== ctx.user.id));
  for (const m of members.filter((x) => notify.has(x.user_id) && x.email))
    await sendMail({
      to: m.email, subject: `${approve ? 'Approved' : 'Changes requested'}: ${old.title}`,
      html: `<p>${ctx.name} ${approve ? 'approved' : 'asked for changes on'} <b>${old.title}</b>.</p>${feedback ? `<p>“${feedback}”</p>` : ''}<p><a href="${base}/t/${ctx.team.id}">Open the task</a></p>`,
    });
  return { ok: true, task: r.data };
}

/* ---------- follow-up requests: ask anyone to follow up on a task ---------- */

export async function askFollowUp({ teamId, taskId, to, message = '', due = null }) {
  const ctx = await getTeamCtx(teamId);
  const members = await memberList(ctx);
  const person = members.find((m) => m.user_id === to);
  if (!person) return { ok: false, error: 'Choose who to ask' };
  const { data: task } = await ctx.sb.from('tp_tasks').select('id, title').eq('id', taskId).maybeSingle();
  if (!task) return { ok: false, error: 'Task not found' };
  message = String(message || '').trim();

  const { data, error } = await ctx.sb.from('tp_followups').insert({
    team_id: ctx.team.id, task_id: taskId, from_user: ctx.user.id, from_name: ctx.name,
    to_user: person.user_id, message: message || null, due_date: due || null,
  }).select().single();
  if (error) {
    return { ok: false, error: /tp_followups/i.test(error.message) ? 'Run supabase/followups.sql in the Supabase SQL editor to switch follow-ups on.' : error.message };
  }
  await log(ctx, taskId, 'follow_up_asked', `${person.name || person.email}${message ? `: ${message}` : ''}`);

  if (person.email && person.user_id !== ctx.user.id) {
    const base = await siteUrl();
    await sendMail({
      to: person.email, subject: `Follow-up requested: ${task.title}`,
      html: `<p>${ctx.name} asked you to follow up on <b>${task.title}</b>.</p>${message ? `<p>“${message}”</p>` : ''}${due ? `<p>Please reply by ${due}.</p>` : ''}<p><a href="${base}/t/${ctx.team.id}">Open the Review tab</a></p>`,
    });
  }
  return { ok: true, followup: data };
}

export async function completeFollowUp({ teamId, id, reply = '' }) {
  const ctx = await getTeamCtx(teamId);
  reply = String(reply || '').trim();
  const { data, error } = await ctx.sb.from('tp_followups')
    .update({ status: 'done', reply: reply || null, done_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };
  await log(ctx, data.task_id, 'follow_up_done', reply || null);

  if (data.from_user && data.from_user !== ctx.user.id) {
    const asker = (await memberList(ctx)).find((m) => m.user_id === data.from_user);
    const { data: task } = await ctx.sb.from('tp_tasks').select('title').eq('id', data.task_id).maybeSingle();
    if (asker?.email) {
      const base = await siteUrl();
      await sendMail({
        to: asker.email, subject: `Follow-up done: ${task?.title || 'task'}`,
        html: `<p>${ctx.name} followed up on <b>${task?.title || 'your task'}</b>.</p>${reply ? `<p>“${reply}”</p>` : ''}<p><a href="${base}/t/${ctx.team.id}">Open the task</a></p>`,
      });
    }
  }
  return { ok: true, followup: data };
}
