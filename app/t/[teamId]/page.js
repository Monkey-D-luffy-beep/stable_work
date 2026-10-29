import Link from 'next/link';
import { getTeamCtx } from '@/lib/ctx';
import TaskWorkspace from '@/components/TaskWorkspace';

export default async function Tasks({ params, searchParams }) {
  const { teamId } = await params;
  const { welcome } = await searchParams;
  const { sb, user, team, isManager } = await getTeamCtx(teamId);

  const [{ data: tasks }, { data: members }] = await Promise.all([
    sb.from('tp_tasks').select('*').eq('team_id', team.id).order('created_at', { ascending: false }).limit(1500),
    sb.from('tp_members').select('*').eq('team_id', team.id).order('created_at'),
  ]);

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Tasks</h1>
          <p className="sub">{team.name} · everyone can see the whole team; you can edit your own tasks{isManager ? ' and anyone’s as a manager' : ''}</p>
        </div>
        {isManager && <Link href={`/t/${team.id}/members#invite`} className="btn primary topbar-cta">+ Invite people</Link>}
      </header>

      {welcome && <p className="notice">Welcome to {team.name}! Add your first task with “+ Add task”, or open DSR to see the team’s shipments.</p>}

      <TaskWorkspace
        teamId={team.id} initialTasks={tasks || []} members={members || []}
        userId={user.id} isManager={isManager}
      />
    </>
  );
}
