import Link from 'next/link';
import { redirect } from 'next/navigation';
import { admin } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabase/server';
import TeamAvatar from '@/components/TeamAvatar';
import SubmitButton from '@/components/SubmitButton';
import { joinWithNewAccount, joinAsCurrentUser } from '../../actions';

export const metadata = { title: 'Join your team · Stableworks' };

// Public page behind a team's join link: new people create an account and join in one step.
export default async function JoinPage({ params, searchParams }) {
  const { token } = await params;
  const { error } = await searchParams;
  const db = admin();

  const { data: team } = await db.from('tp_teams').select('*').eq('join_token', token).eq('join_enabled', true).maybeSingle();
  if (!team) {
    return (
      <main className="login-form" style={{ minHeight: '100vh' }}>
        <div className="login-box">
          <img src="/logo.png" alt="Stableworks" className="auth-logo" />
          <h1>This link isn’t active</h1>
          <p className="sub">The invite link may have been replaced or turned off. Ask your team manager for a new one.</p>
          <Link href="/login" className="btn">Go to sign in</Link>
        </div>
      </main>
    );
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const [{ count }, mine] = await Promise.all([
    db.from('tp_members').select('*', { count: 'exact', head: true }).eq('team_id', team.id),
    user ? db.from('tp_members').select('user_id').eq('team_id', team.id).eq('user_id', user.id).maybeSingle() : { data: null },
  ]);
  if (mine.data) redirect(`/t/${team.id}`);

  return (
    <main className="login">
      <aside className="login-brand">
        <Link href="/"><img className="brand-logo" src="/logo-white.png" alt="Stableworks" /></Link>
        <div>
          <div className="join-team"><TeamAvatar team={team} size={72} /></div>
          <h2>Join <em>{team.name}</em></h2>
          <p>{team.description || 'See what needs doing, add your own tasks and keep the team on track.'}</p>
          <small>{count || 1} {count === 1 ? 'person has' : 'people have'} already joined</small>
        </div>
        <small>© {new Date().getFullYear()} Stableworks</small>
      </aside>

      <section className="login-form">
        <div className="login-box">
          {user ? (
            <>
              <h1>Join {team.name}</h1>
              <p className="sub">You’re signed in as <b>{user.email}</b>.</p>
              {error && <p className="error">{error}</p>}
              <form action={joinAsCurrentUser} className="panel stack">
                <input type="hidden" name="token" value={token} />
                <SubmitButton className="btn primary" pendingText="Joining…">Join the team</SubmitButton>
              </form>
            </>
          ) : (
            <>
              <h1>Create your account</h1>
              <p className="sub">It takes about 20 seconds. You’ll join <b>{team.name}</b> straight away.</p>
              {error && <p className="error">{error}</p>}
              <form action={joinWithNewAccount} className="panel stack">
                <input type="hidden" name="token" value={token} />
                <input name="name" placeholder="Your name" autoComplete="name" required autoFocus />
                <input name="email" type="email" placeholder="you@company.com" autoComplete="email" required />
                <input name="password" type="password" placeholder="Choose a password (8+ characters)" minLength={8} autoComplete="new-password" required />
                <SubmitButton className="btn primary" pendingText="Creating your account…">Create account &amp; join</SubmitButton>
              </form>
              <p className="sub">Already have an account? <Link href={`/login?mode=signin&next=${encodeURIComponent(`/j/${token}`)}`}><b>Sign in</b></Link></p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
