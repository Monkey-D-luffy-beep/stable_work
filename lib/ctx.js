import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export const getUser = cache(async () => {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  return { sb, user };
});

export const getMyTeams = cache(async () => {
  const { sb, user } = await getUser();
  const { data } = await sb
    .from('members')
    .select('role, name, team:teams(*)')
    .eq('user_id', user.id)
    .order('created_at');
  return (data || []).filter((m) => m.team);
});

// Context for one team: the signed-in user's role in it, plus helpers.
export const getTeamCtx = cache(async (teamId) => {
  const { sb, user } = await getUser();
  const teams = await getMyTeams();
  const mine = teams.find((m) => m.team.id === teamId);
  if (!mine) notFound();
  return {
    sb,
    user,
    team: mine.team,
    teams,
    isManager: mine.role === 'manager',
    name: mine.name || user.email.split('@')[0],
  };
});
