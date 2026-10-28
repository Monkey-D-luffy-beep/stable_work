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

const str = (fd, k) => (fd.get(k) || '').toString().trim();
const enc = encodeURIComponent;

/* ---------- auth ---------- */

export async function login(fd) {
  const email = str(fd, 'email').toLowerCase();
  const next = str(fd, 'next') || '/';
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=${enc(next)}` },
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
  const { error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) fail(/already|registered|exists/i.test(error.message) ? 'That email already has an account. Use Sign in.' : error.message);
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
    subject: `${inviterName} invited you to ${team.name} on Tiger Projects`,
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
  await Promise.all([
    pic.avatar ? db.from('tp_teams').update({ avatar: pic.avatar }).eq('id', team.id) : null,
    db.from('tp_members').insert({
      team_id: team.id, user_id: user.id, role: 'manager', email: user.email, name: user.email.split('@')[0],
    }),
  ]);
  const inv = await sendInvites(db, team, user.email.split('@')[0], parseEmails(str(fd, 'emails')), 'member');
  redirect(`/t/${team.id}/members?msg=${enc(inv.created ? `Team created. ${inv.created} invite(s) sent.` : 'Team created. Invite your people below.')}`);
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
  await db.from('tp_members').upsert({
    team_id: inv.team_id, user_id: user.id, role: inv.role, email: user.email, name: user.email.split('@')[0],
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
