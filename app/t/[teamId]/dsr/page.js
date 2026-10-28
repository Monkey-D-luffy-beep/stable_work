import { getTeamCtx } from '@/lib/ctx';
import { isClosed, broPending } from '@/lib/dsr';
import { today } from '@/lib/util';
import DsrBoard from '@/components/DsrBoard';

export default async function Dsr({ params, searchParams }) {
  const { teamId } = await params;
  const { msg } = await searchParams;
  const { sb, team, isManager } = await getTeamCtx(teamId);

  const { data } = await sb.from('tp_shipments').select('*').eq('team_id', team.id).order('created_at').limit(2000);
  const rows = data || [];

  const open = rows.filter((r) => !isClosed(r));
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const arriving = open.filter((r) => r.eta && r.eta >= today() && r.eta <= soon);

  return (
    <>
      <header className="topbar">
        <div>
          <h1>DSR</h1>
          <p className="sub">Daily Shipment Report · {team.name}</p>
        </div>
      </header>
      {msg && <p className="notice">{msg}</p>}

      <div className="stats">
        <div className="stat hero"><div className="label">Total shipments</div><div className="num">{rows.length}</div></div>
        <div className="stat"><div className="label">Open jobs</div><div className="num">{open.length}</div></div>
        <div className="stat"><div className="label">Arriving in 7 days</div><div className="num">{arriving.length}</div></div>
        <div className="stat"><div className="label">BRO pending</div><div className="num" style={{ color: rows.some(broPending) ? 'var(--amber)' : undefined }}>{rows.filter(broPending).length}</div></div>
      </div>

      <DsrBoard teamId={team.id} rows={rows} isManager={isManager} />
    </>
  );
}
