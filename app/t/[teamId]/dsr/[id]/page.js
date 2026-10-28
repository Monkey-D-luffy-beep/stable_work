import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTeamCtx } from '@/lib/ctx';
import ShipmentFields from '@/components/ShipmentFields';
import SubmitButton from '@/components/SubmitButton';
import { updateShipment, deleteShipment } from '../../../../actions';

export default async function ShipmentPage({ params }) {
  const { teamId, id } = await params;
  const { sb, team, isManager } = await getTeamCtx(teamId);
  const { data: s } = await sb.from('tp_shipments').select('*').eq('id', id).eq('team_id', team.id).maybeSingle();
  if (!s) notFound();

  const hidden = (<><input type="hidden" name="teamId" value={team.id} /><input type="hidden" name="id" value={s.id} /></>);

  return (
    <>
      <Link href={`/t/${team.id}/dsr`} className="sub">← DSR</Link>
      <header className="topbar">
        <div>
          <h1>{s.mbl || s.hbl || s.trl_no || 'Shipment'}</h1>
          <p className="sub">{[s.shipper_name, s.pol && s.pod ? `${s.pol} → ${s.pod}` : null].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      <form action={updateShipment} className="panel stack">
        {hidden}
        <ShipmentFields values={s} />
        <SubmitButton className="btn primary" pendingText="Saving…">Save changes</SubmitButton>
      </form>
      {isManager && (
        <form action={deleteShipment}>{hidden}<SubmitButton className="btn danger">Delete shipment</SubmitButton></form>
      )}
    </>
  );
}
