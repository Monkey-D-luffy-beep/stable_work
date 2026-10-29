import { admin } from './admin';
import { defaultAvatar } from './avatars';

// Team members with their picture filled in. The picture lives on the member row once avatars.sql has been run;
// until then (or for older rows) it is read from the person's account profile, so it shows the same everywhere.
export async function loadMembers(sb, teamId) {
  const { data } = await sb.from('tp_members').select('*').eq('team_id', teamId).order('created_at');
  const members = data || [];
  if (!members.some((m) => !m.avatar)) return members;

  const pics = new Map();
  try {
    const { data: res } = await admin().auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of res?.users || []) if (u.user_metadata?.avatar) pics.set(u.id, u.user_metadata.avatar);
  } catch {}
  return members.map((m) => ({ ...m, avatar: m.avatar || pics.get(m.user_id) || defaultAvatar(m.email) }));
}
