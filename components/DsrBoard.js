'use client';

import Link from 'next/link';
import { useMemo, useOptimistic, useRef, useState } from 'react';
import { createShipment, deleteShipment, importShipments } from '@/app/actions';
import { FIELDS, cleanRow } from '@/lib/dsr';
import { fmtDate } from '@/lib/util';
import ShipmentFields from './ShipmentFields';
import SubmitButton from './SubmitButton';

const statusClass = (s) => (/closed|delivered/i.test(s || '') ? 'ok' : /transit|sail|open/i.test(s || '') ? 'go' : 'wait');

// Searchable shipment table. Rows are filtered in the browser (instant), new rows appear
// immediately and deleted rows fade out while the server confirms in the background.
export default function DsrBoard({ teamId, rows, isManager }) {
  const [list, addOptimistic] = useOptimistic(rows, (state, row) => [...state, row]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [leaving, setLeaving] = useState(() => new Set());
  const [gone, setGone] = useState(() => new Set());
  const formRef = useRef(null);

  async function add(fd) {
    const row = cleanRow(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')));
    if (!row.mbl && !row.hbl && !row.trl_no && !row.shipper_name) return;
    addOptimistic({ ...row, id: `tmp-${Date.now()}`, pending: true });
    formRef.current?.reset();
    await createShipment(fd);
  }

  async function remove(fd) {
    const id = fd.get('id');
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => setGone((s) => new Set(s).add(id)), 260);
    await deleteShipment(fd);
  }

  const numbered = useMemo(() => list.filter((r) => !gone.has(r.id)).map((r, i) => ({ ...r, sno: i + 1 })), [list, gone]);
  const statuses = useMemo(() => ['ALL', ...new Set(numbered.map((r) => r.job_status).filter(Boolean))], [numbered]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return numbered.filter((r) =>
      (status === 'ALL' || r.job_status === status) &&
      (!needle || FIELDS.some((f) => String(r[f.key] ?? '').toLowerCase().includes(needle))));
  }, [numbered, q, status]);

  return (
    <>
      <details className="panel add" open={!rows.length}>
        <summary>+ Add shipment</summary>
        <form ref={formRef} action={add} className="stack">
          <input type="hidden" name="teamId" value={teamId} />
          <ShipmentFields />
          <SubmitButton className="btn primary" pendingText="Adding…">Add shipment</SubmitButton>
        </form>
      </details>

      <details className="panel add">
        <summary>Import from Excel / Google Sheets</summary>
        <form action={importShipments} className="stack">
          <input type="hidden" name="teamId" value={teamId} />
          <p className="sub">Copy the rows in your sheet (include the header row if you like) and paste them below. Dates such as 1/9/2026 are read as month/day/year.</p>
          <textarea name="sheet" rows="6" placeholder="Paste rows here…" required />
          <SubmitButton className="btn primary" pendingText="Importing…">Import rows</SubmitButton>
        </form>
      </details>

      <div className="filters">
        <input className="dsr-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search shipper, MBL, HBL, port, line…" />
        {statuses.map((s) => (
          <button key={s} type="button" className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
            {s === 'ALL' ? 'All' : s}
          </button>
        ))}
        <a className="btn sm export" href={`/t/${teamId}/dsr/export`}>Export CSV</a>
      </div>

      {shown.length === 0 ? (
        <div className="panel empty">{numbered.length ? 'No shipments match your search.' : 'No shipments yet. Add one or import your sheet.'}</div>
      ) : (
        <div className="dsr-wrap">
          <table className="dsr">
            <thead>
              <tr>
                <th>S NO</th>
                {FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
                {isManager && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`row enter ${r.pending ? 'pending' : ''} ${leaving.has(r.id) ? 'leaving' : ''}`}>
                  <td className="sno">{r.sno}</td>
                  {FIELDS.map((f) => {
                    const v = r[f.key];
                    let cell = f.date ? fmtDate(v) : v ?? '';
                    if (f.key === 'job_status' && v) cell = <span className={`jobs ${statusClass(v)}`}>{v}</span>;
                    else if (f.key === 'bro_received' && v) cell = <span className={`jobs ${v === 'RECEIVED' ? 'ok' : 'wait'}`}>{v}</span>;
                    else if ((f.key === 'trl_no' || f.key === 'mbl') && !r.pending && v)
                      cell = <Link href={`/t/${teamId}/dsr/${r.id}`}><b>{v}</b></Link>;
                    return <td key={f.key} className={f.key === 'shipper_name' ? 'wide' : ''}>{cell}</td>;
                  })}
                  {isManager && (
                    <td>
                      {!r.pending && (
                        <form action={remove}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="stay" value="1" />
                          <button className="icon-btn" title="Delete shipment" aria-label="Delete shipment">✕</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sub">{shown.length} of {numbered.length} shipments</p>
    </>
  );
}
