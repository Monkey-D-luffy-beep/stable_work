import SubmitButton from "@/components/SubmitButton";
import Link from 'next/link';
import { getTeamCtx } from '@/lib/ctx';
import TeamAvatar from '@/components/TeamAvatar';
import Avatar from '@/components/Avatar';
import { defaultAvatar } from '@/lib/avatars';
import { logout } from '../../actions';

export default async function TeamLayout({ children, params }) {
  const { teamId } = await params;
  const { sb, team, teams, isManager, name, avatar, user } = await getTeamCtx(teamId);

  // What is waiting: managers see every pending review; everyone sees follow-ups asked of them.
  const reviewQ = sb.from('tp_tasks').select('id', { count: 'exact', head: true }).eq('team_id', team.id).eq('status', 'review');
  const [rev, fol] = await Promise.all([
    isManager ? reviewQ : reviewQ.eq('reviewer_id', user.id),
    sb.from('tp_followups').select('id', { count: 'exact', head: true }).eq('team_id', team.id).eq('status', 'open').eq('to_user', user.id),
  ]);
  const pending = (rev.error ? 0 : rev.count || 0) + (fol.error ? 0 : fol.count || 0);

  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/"><img className="logo" src="/logo.png" alt="Stableworks" /></Link>
        <div className="side-head"><span>Teams</span><Link href="/teams/new" className="icon-btn" title="New team">+</Link></div>
        <div className="projects">
          {teams.map((m) => (
            <Link key={m.team.id} href={`/t/${m.team.id}`} className={`proj ${m.team.id === team.id ? 'active' : ''}`}>
              <TeamAvatar team={m.team} size={26} />
              <span>{m.team.name}</span>
            </Link>
          ))}
        </div>
        <div className="side-head" style={{ marginTop: 22 }}><span>{team.name}</span><span className={`tag ${isManager ? 'manager' : 'member'}`}>{isManager ? 'manager' : 'member'}</span></div>
        <nav className="nav">
          <Link className="nav-item" href={`/t/${team.id}/dsr`}>DSR</Link>
          <Link className="nav-item" href={`/t/${team.id}`}>Tasks{pending > 0 && <i className="nav-badge" title="Reviews and follow-ups waiting">{pending}</i>}</Link>
          <Link className="nav-item" href={`/t/${team.id}/members`}>{isManager ? 'Members & settings' : 'Members'}</Link>
        </nav>
        <Link href="/profile" className="me-chip"><Avatar src={avatar || defaultAvatar(user.email)} name={name} size={32} /><span><b>{name}</b><small>Edit profile</small></span></Link>
        <form action={logout} style={{ marginTop: 12 }}><SubmitButton className="btn">Sign out</SubmitButton></form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
