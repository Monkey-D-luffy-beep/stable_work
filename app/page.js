import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { getMyTeams } from '@/lib/ctx';
import TeamAvatar from '@/components/TeamAvatar';
import Landing from '@/components/Landing';
import SubmitButton from '@/components/SubmitButton';
import { logout } from './actions';

export default async function Home({ searchParams }) {
  const { msg } = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return <Landing />;

  const teams = await getMyTeams();
  return (
    <main className="wrap">
      <header className="home-head">
        <img src="/logo.png" alt="Stableworks" className="auth-logo" />
        <Link href="/profile" className="sub">{user.email} · <b>Profile</b></Link>
        <form action={logout}><SubmitButton className="btn">Sign out</SubmitButton></form>
      </header>
      {msg && <p className="notice">{msg}</p>}
      <div className="home-title">
        <h1>Your teams</h1>
        <Link href="/teams/new" className="btn primary">+ New team</Link>
      </div>
      {teams.length === 0 ? (
        <div className="panel empty">
          You're not in any team yet. Create one for a project, or open an invite link you were sent.
        </div>
      ) : (
        <div className="team-grid">
          {teams.map(({ team, role }) => (
            <Link key={team.id} href={`/t/${team.id}`} className="panel team-card">
              <TeamAvatar team={team} size={52} />
              <div>
                <b>{team.name}</b>
                <div className="sub">{team.description || 'No description'}</div>
              </div>
              <span className={`tag ${role}`}>{role}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
