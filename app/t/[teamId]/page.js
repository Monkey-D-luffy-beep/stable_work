import Link from 'next/link';
import { getTeamCtx } from '@/lib/ctx';
import { isOverdue, nameOf, sortTasks, today } from '@/lib/util';
import TaskBoard from '@/components/TaskBoard';

export default async function Tasks({ params, searchParams }) {
  const { teamId } = await params;
  const { view = 'all', show = 'open' } = await searchParams;
  const { sb, user, team, isManager } = await getTeamCtx(teamId);

  const [{ data: all }, { data: members }] = await Promise.all([
    sb.from('tp_tasks').select('*').eq('team_id', team.id),
    sb.from('tp_members').select('user_id, name, email, role').eq('team_id', team.id),
  ]);

  let tasks = all || [];
  if (isManager && view === 'mine') tasks = tasks.filter((t) => t.assignee_id === user.id);
  const open = tasks.filter((t) => t.status !== 'done');
  const shown = sortTasks(tasks.filter((t) => (show === 'done' ? t.status === 'done' : show === 'all' ? true : t.status !== 'done')));
  const toReview = open.filter((t) => t.status === 'review');
  const followUps = open.filter((t) => t.follow_up_date && t.follow_up_date <= today());
  const q = (o) => `?${new URLSearchParams({ view, show, ...o })}`;
  const assigneeLabel = (t) => (t.for_team ? 'Whole team' : nameOf(members || [], t.assignee_id));

  const rows = shown.map((t) => ({
    id: t.id, title: t.title, urgency: t.urgency, deadline: t.deadline, status: t.status,
    follow_up_date: t.follow_up_date, assigneeLabel: assigneeLabel(t), overdue: isOverdue(t),
  }));

  const above = (
    <>
      {isManager && toReview.length > 0 && (
        <section className="panel attention">
          <h3>Waiting for your review</h3>
          {toReview.map((t) => (
            <Link key={t.id} className="mini" href={`/t/${team.id}/tasks/${t.id}`}>
              <span className="t">{t.title}</span><span className="sub">{assigneeLabel(t)}</span>
            </Link>
          ))}
        </section>
      )}
      <div className="filters">
        {isManager && (<>
          <Link className={`chip ${view === 'all' ? 'on' : ''}`} href={q({ view: 'all' })}>Whole team</Link>
          <Link className={`chip ${view === 'mine' ? 'on' : ''}`} href={q({ view: 'mine' })}>Assigned to me</Link>
          <span className="sep" />
        </>)}
        {[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => (
          <Link key={k} className={`chip ${show === k ? 'on' : ''}`} href={q({ show: k })}>{l}</Link>
        ))}
      </div>
    </>
  );

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{team.name}</h1>
          <p className="sub">{isManager ? 'Every task in this team' : 'Your tasks and tasks shared with the whole team'}</p>
        </div>
        {isManager && <Link href={`/t/${team.id}/members#invite`} className="btn primary topbar-cta">+ Invite people</Link>}
      </header>

      <div className="stats">
        <div className="stat hero"><div className="label">Open</div><div className="num">{open.length}</div></div>
        <div className="stat"><div className="label">Overdue</div><div className="num" style={{ color: open.some(isOverdue) ? 'var(--red)' : undefined }}>{open.filter(isOverdue).length}</div></div>
        <div className="stat"><div className="label">{isManager ? 'To review' : 'In review'}</div><div className="num">{toReview.length}</div></div>
        <div className="stat"><div className="label">Follow-ups due</div><div className="num">{followUps.length}</div></div>
      </div>

      <TaskBoard
        teamId={team.id} rows={rows} isManager={isManager} userId={user.id} show={show}
        members={members || []} above={above}
      />
    </>
  );
}
