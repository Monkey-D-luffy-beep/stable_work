// Demo data: one sample team of 5 people with realistic freight-forwarding tasks and DSR shipments.
//   node --env-file=.env.local scripts/seed-demo.cjs            create the demo team
//   node --env-file=.env.local scripts/seed-demo.cjs --remove   delete the demo team and its demo people
// All people, companies and shipments are fictional. The demo people use @example.com addresses and random
// passwords nobody knows, so they can never be signed in to.
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const OWNER = process.env.DEMO_OWNER_EMAIL || 'saurav.chaudhary70@gmail.com';
const TEAM_NAME = 'Demo';
const OLD_NAMES = ['Demo', 'Demo: Export Operations'];
const SAMPLE_DESC = 'Sample team with realistic freight-forwarding work.';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DAY = 864e5;
const now = Date.now();
const iso = (n) => new Date(now + n * DAY).toISOString().slice(0, 10);
const ts = (n, hour = 9) => { const d = new Date(now + n * DAY); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

const PEOPLE = [
  { key: 'priya', name: 'Priya Sharma', email: 'demo.priya.sharma@example.com', avatar: '/avatars/team-02.png' },
  { key: 'amit', name: 'Amit Verma', email: 'demo.amit.verma@example.com', avatar: '/avatars/team-03.png' },
  { key: 'neha', name: 'Neha Kapoor', email: 'demo.neha.kapoor@example.com', avatar: '/avatars/team-04.png' },
  { key: 'rahul', name: 'Rahul Mehta', email: 'demo.rahul.mehta@example.com', avatar: '/avatars/team-06.png' },
];

async function allUsers() {
  const out = [];
  for (let p = 1; p <= 50; p++) {
    const { data } = await db.auth.admin.listUsers({ page: p, perPage: 200 });
    if (!data?.users?.length) break;
    out.push(...data.users);
  }
  return out;
}

async function hasColumn(table, col) { return !(await db.from(table).select(col).limit(1)).error; }

async function remove() {
  const users = await allUsers();
  const owner = users.find((u) => u.email?.toLowerCase() === OWNER);
  const { data: teams } = await db.from('tp_teams').select('id').in('name', OLD_NAMES).eq('created_by', owner?.id).like('description', `${SAMPLE_DESC}%`);
  for (const t of teams || []) await db.from('tp_teams').delete().eq('id', t.id);   // cascades members, tasks, history, shipments
  const demo = users.filter((u) => u.user_metadata?.demo === true && /^demo\..+@example\.com$/.test(u.email || ''));
  for (const u of demo) { await db.from('profiles').delete().eq('id', u.id); await db.auth.admin.deleteUser(u.id); }
  console.log(`removed ${teams?.length || 0} demo team(s) and ${demo.length} demo people`);
}

async function create() {
  const users = await allUsers();
  const owner = users.find((u) => u.email?.toLowerCase() === OWNER);
  if (!owner) throw new Error(`No account found for ${OWNER}`);

  const { data: existing } = await db.from('tp_teams').select('id').in('name', OLD_NAMES).eq('created_by', owner.id).like('description', `${SAMPLE_DESC}%`).limit(1);
  if (existing?.length) { console.log('The demo team already exists. Run with --remove first to recreate it.'); return; }

  const cols = {
    start: await hasColumn('tp_tasks', 'start_date'),
    reviewer: await hasColumn('tp_tasks', 'reviewer_id'),
    note: await hasColumn('tp_tasks', 'review_note'),
    avatar: await hasColumn('tp_members', 'avatar'),
    join: await hasColumn('tp_teams', 'join_token'),
    ship: await hasColumn('tp_shipments', 'id'),
  };

  // --- people (four demo accounts + you) ---
  const ids = { me: owner.id };
  for (const p of PEOPLE) {
    const found = users.find((u) => u.email === p.email);
    if (found) { ids[p.key] = found.id; continue; }
    const r = await db.auth.admin.createUser({
      email: p.email, password: crypto.randomBytes(24).toString('base64url'), email_confirm: true,
      user_metadata: { app: 'stableworks', full_name: p.name, avatar: p.avatar, demo: true },
    });
    if (r.error) throw new Error(`Could not create ${p.email}: ${r.error.message}`);
    ids[p.key] = r.data.user.id;
  }
  const myName = owner.user_metadata?.full_name || 'Saurav';
  const nameOf = { me: myName, ...Object.fromEntries(PEOPLE.map((p) => [p.key, p.name])) };

  // --- team ---
  const { data: team, error: te } = await db.from('tp_teams').insert({
    name: TEAM_NAME, description: `${SAMPLE_DESC} Safe to delete.`,
    avatar: 'ship', created_by: owner.id, ...(cols.join ? { join_token: crypto.randomBytes(9).toString('hex') } : {}),
  }).select().single();
  if (te) throw te;

  const member = (key, role, avatar) => ({
    team_id: team.id, user_id: ids[key], role, name: nameOf[key], email: key === 'me' ? owner.email : PEOPLE.find((p) => p.key === key).email,
    ...(cols.avatar ? { avatar } : {}),
  });
  const { error: me } = await db.from('tp_members').insert([
    member('me', 'manager', owner.user_metadata?.avatar || '/avatars/team-01.png'),
    ...PEOPLE.map((p) => member(p.key, 'member', p.avatar)),
  ]);
  if (me) throw me;

  // --- tasks: [title, notes, urgency, status, assignee|'team', startOffset, deadlineOffset|null, createdAgo, extras] ---
  const T = [
    ['Customs clearance: Mundra shipment', 'Bill of Entry filed. Waiting for an examination slot at the CFS.', 'urgent', 'in_progress', 'priya', -4, 1, 5],
    ['Invoice for export consignment INV-2041', 'Commercial invoice and packing list attached. Please check HS codes and totals.', 'high', 'review', 'amit', -3, 0, 4, { reviewer: 'me', requested: -0.5 }],
    ['Draft Bill of Lading: MSC Aurora', 'Shipper instructions received on Monday.', 'high', 'changes_requested', 'amit', -6, 2, 7,
      { reviewer: 'me', note: 'Consignee address is missing the PIN code, and the shipper reference should match the invoice.', requested: -2 }],
    ['Freight booking: Nhava Sheva to Rotterdam', '2 x 40HQ. Compare MSC, Maersk and CMA CGM rates before booking.', 'medium', 'todo', 'rahul', 0, 6, 1],
    ['Marketing: LinkedIn campaign for the DSR launch', 'Three posts plus one short video. Draft copy first.', 'medium', 'in_progress', 'neha', -2, 5, 4],
    ['Follow up with MSC on container release', 'Release order still pending. Escalate if no reply today.', 'urgent', 'todo', 'rahul', -2, -1, 3, { follow: 0, followNote: 'Call MSC ops desk' }],
    ['Weekly DSR update to key customers', 'Send the Friday status email to all active shippers.', 'medium', 'todo', 'team', 0, 2, 2],
    ['Quote: Chennai to Singapore, 4 x 40HQ', 'Quote sent and accepted by the customer.', 'medium', 'done', 'rahul', -9, -4, 10, { completed: -4 }],
    ['Client call: freight rate review with Northwind Exports', 'Agenda: Q4 rates, space commitments, payment terms.', 'medium', 'todo', 'me', 0, 1, 2, { follow: 3, followNote: 'Send the call summary' }],
    ['Fix HBL numbering sequence in templates', 'Sequence restarts at the wrong prefix. Needs a second pair of eyes.', 'low', 'review', 'rahul', -4, 3, 5, { reviewer: 'priya', requested: -1 }],
  ];

  const taskRows = T.map(([title, notes, urgency, status, who, start, deadline, createdAgo, x = {}]) => {
    const row = {
      team_id: team.id, title, notes, urgency, status, created_by: ids.me,
      assignee_id: who === 'team' ? null : ids[who], for_team: who === 'team',
      deadline: deadline == null ? null : iso(deadline),
      created_at: ts(-createdAgo), updated_at: ts(-Math.max(0, createdAgo - 1)),
      completed_at: status === 'done' ? ts(x.completed ?? -1, 16) : null,
      follow_up_date: x.follow != null ? iso(x.follow) : null, follow_up_note: x.followNote || null,
      review_requested_at: x.requested != null ? new Date(now + x.requested * DAY).toISOString() : null,
    };
    if (cols.start && start != null) row.start_date = iso(start);
    if (cols.reviewer && x.reviewer) row.reviewer_id = ids[x.reviewer];
    if (cols.note && x.note) row.review_note = x.note;
    return row;
  });
  const { data: tasks, error: tk } = await db.from('tp_tasks').insert(taskRows).select('id,title,status,created_at,assignee_id');
  if (tk) throw tk;

  // --- history so the timeline on each task is not empty ---
  const events = [];
  const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t]));
  T.forEach(([title, , , status, who, , , createdAgo, x = {}]) => {
    const t = byTitle[title];
    const ev = (type, detail, atDays, actor = 'me') => events.push({
      task_id: t.id, team_id: team.id, actor_id: ids[actor], actor_name: nameOf[actor], type, detail, created_at: new Date(now + atDays * DAY).toISOString(),
    });
    ev('created', who === 'team' ? 'Assigned to the whole team' : `Assigned to ${nameOf[who]}`, -createdAgo);
    if (status === 'in_progress') ev('updated', 'status To do → In progress', -Math.max(1, createdAgo - 2), who === 'team' ? 'me' : who);
    if (status === 'review') ev('review_requested', `reviewer: ${nameOf[x.reviewer]}`, x.requested, who);
    if (status === 'changes_requested') { ev('review_requested', `reviewer: ${nameOf[x.reviewer]}`, x.requested - 1, who); ev('changes_requested', x.note, x.requested, x.reviewer); }
    if (status === 'done') {
      if (x.approved) { ev('review_requested', `reviewer: ${nameOf[x.reviewer]}`, x.completed - 1, who); ev('review_approved', x.note, x.completed, x.reviewer); }
      else ev('updated', 'status In progress → Done', x.completed, who);
    }
    if (x.followNote) ev('follow_up_set', `${iso(x.follow)} — ${x.followNote}`, -1);
  });
  events.push({ task_id: byTitle['Customs clearance: Mundra shipment'].id, team_id: team.id, actor_id: ids.priya, actor_name: nameOf.priya, type: 'note',
    detail: 'Shipping line confirmed the vessel is on schedule. CFS slot requested for Thursday morning.', created_at: ts(-1, 15) });
  const { error: ee } = await db.from('tp_task_events').insert(events);
  if (ee) throw ee;

  // --- DSR shipments (fictional) ---
  let shipments = 0;
  if (cols.ship) {
    const S = [
      ['1041', 'Northwind Exports Pvt Ltd', 'MSC', 'MSCU4401201', 'HBL-0101-A', 'SEA', 4, '40HQ', 'Nhava Sheva', 'Rotterdam', 'Rotterdam', -6, 18, 'YES', 'RECEIVED', 'IN TRANSIT'],
      ['1042', 'Contoso Textiles Ltd', 'MAERSK', 'MAEU7788122', 'HBL-0102-A', 'SEA', 2, '20GP', 'Mundra', 'Jebel Ali', 'Jebel Ali', -3, 4, 'YES', 'NOT RECEIVED', 'IN TRANSIT'],
      ['1043', 'Fabrikam Auto Parts', 'CMA CGM', 'CMDU5566340', 'HBL-0103-B', 'SEA', 1, '40HQ', 'Chennai', 'Singapore', 'Singapore', -12, -4, 'YES', 'RECEIVED', 'JOB CLOSED'],
      ['1044', 'Adventure Works Cycles', 'HAPAG-LLOYD', 'HLCU2290917', 'HBL-0104-A', 'SEA', 3, '40HQ', 'Nhava Sheva', 'Hamburg', 'Hamburg', 5, 27, 'NO', null, 'JOB OPEN'],
      ['1045', 'Tailspin Electronics', 'ONE', 'ONEY8812004', 'HBL-0105-A', 'SEA', 5, '20GP', 'Kolkata', 'Colombo', 'Colombo', -2, 6, 'YES', 'NOT RECEIVED', 'IN TRANSIT'],
      ['1046', 'Litware Pharma', 'QATAR AIRWAYS CARGO', 'QR-157-4410', 'HAWB-77-12', 'AIR', null, 'KGS', 'Delhi', 'Doha', 'London', 1, 3, 'YES', 'RECEIVED', 'JOB OPEN'],
      ['1047', 'Woodgrove Foods', 'MSC', 'MSCU6612093', 'HBL-0107-A', 'SEA', 2, '40RF', 'Tuticorin', 'Port Klang', 'Port Klang', -9, -1, 'YES', 'RECEIVED', 'ARRIVED'],
      ['1048', 'Proseware Furniture', 'EVERGREEN', 'EGLV1450388', 'HBL-0108-A', 'SEA', 6, '40HQ', 'Mundra', 'Felixstowe', 'Felixstowe', 8, 30, 'NO', null, 'JOB OPEN'],
    ];
    const rows = S.map(([trl, shipper, line, mbl, hbl, type, qty, ctype, pol, pod, fpod, etd, eta, bro, broRec, job], i) => ({
      team_id: team.id, trl_no: trl, shipper_name: shipper, shipping_line: line, mbl, hbl, shipment_type: type, cntr_qnty: qty, cntr_type: ctype,
      pol, pod, fpod, etd: iso(etd), eta: iso(eta), bro, bro_received: broRec, job_status: job, created_by: ids.me, created_at: ts(-14 + i),
    }));
    const { error: se } = await db.from('tp_shipments').insert(rows);
    if (se) throw se;
    shipments = rows.length;
  }

  console.log(JSON.stringify({
    team: team.id, people: 5, tasks: tasks.length, events: events.length, shipments,
    note: [!cols.reviewer && 'run supabase/review-timeline.sql, then re-seed, to get reviewers and start dates', !cols.avatar && 'run supabase/avatars.sql for pictures'].filter(Boolean),
  }, null, 2));
}

(process.argv.includes('--remove') ? remove() : create()).catch((e) => { console.error('ERROR', e.message || e); process.exit(1); });
