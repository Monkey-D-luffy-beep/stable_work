import { admin } from '@/lib/admin';
import { getUser } from '@/lib/ctx';
import TeamAvatar from '@/components/TeamAvatar';
import { acceptInvite } from '../actions';

export default async function Join({ searchParams }) {
  const { token, error } = await searchParams;
  await getUser();
  const { data: inv } = token
    ? await admin().from('tp_invites').select('*, team:tp_teams(*)').eq('token', token).is('accepted_at', null).maybeSingle()
    : { data: null };

  return (
    <main className="center">
      <div className="auth-card">
        {inv ? (
          <>
            <TeamAvatar team={inv.team} size={64} />
            <h1>Join {inv.team.name}</h1>
            <p className="sub">You've been invited as a <b>{inv.role}</b> ({inv.email}).</p>
            {error && <p className="error">{error}</p>}
            <form action={acceptInvite}>
              <input type="hidden" name="token" value={token} />
              <button className="btn primary">Accept invite</button>
            </form>
          </>
        ) : (
          <>
            <h1>Invite not found</h1>
            <p className="sub">It may have been used or revoked. <a href="/">Go home</a></p>
          </>
        )}
      </div>
    </main>
  );
}
