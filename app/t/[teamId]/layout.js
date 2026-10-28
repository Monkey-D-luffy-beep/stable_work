import SubmitButton from "@/components/SubmitButton";
import Link from 'next/link';
import { getTeamCtx } from '@/lib/ctx';
import TeamAvatar from '@/components/TeamAvatar';
import { logout } from '../../actions';

export default async function TeamLayout({ children, params }) {
  const { teamId } = await params;
  const { team, teams, isManager } = await getTeamCtx(teamId);

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
          <Link className="nav-item" href={`/t/${team.id}`}>Tasks</Link>
          <Link className="nav-item" href={`/t/${team.id}/members`}>{isManager ? 'Members & settings' : 'Members'}</Link>
        </nav>
        <form action={logout} style={{ marginTop: 24 }}><SubmitButton className="btn">Sign out</SubmitButton></form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
