// Daily Shipment Report: column definitions, spreadsheet-paste parsing and CSV export.

export const FIELDS = [
  { key: 'trl_no', label: 'TRL NO' },
  { key: 'shipper_name', label: 'SHIPPER NAME' },
  { key: 'shipping_line', label: 'SHIPPING LINE' },
  { key: 'mbl', label: 'MBL' },
  { key: 'hbl', label: 'HBL' },
  { key: 'shipment_type', label: 'SHIPMENT TYPE', options: ['SEA', 'AIR', 'ROAD', 'RAIL'] },
  { key: 'cntr_qnty', label: 'CNTR QNTY', num: true },
  { key: 'cntr_type', label: 'CNTR TYPE / UNIT' },
  { key: 'pol', label: 'POL' },
  { key: 'pod', label: 'POD' },
  { key: 'fpod', label: 'FPOD' },
  { key: 'etd', label: 'ETD POL', date: true },
  { key: 'eta', label: 'ETA POD', date: true },
  { key: 'bro', label: 'BRO', options: ['YES', 'NO'] },
  { key: 'bro_received', label: 'BRO RECEIVED', options: ['RECEIVED', 'NOT RECEIVED'] },
  { key: 'job_status', label: 'JOB STATUS', suggest: ['JOB OPEN', 'IN TRANSIT', 'ARRIVED', 'DELIVERED', 'JOB CLOSED'] },
];

const UPPER = new Set(['shipment_type', 'bro', 'bro_received', 'job_status']);
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Header text in a sheet -> field key (includes the "ETD POIL" typo from the source sheet).
const ALIASES = Object.fromEntries([
  ...FIELDS.map((f) => [norm(f.label), f.key]),
  ['ETDPOIL', 'etd'], ['ETDPOL', 'etd'], ['ETD', 'etd'], ['ETA', 'eta'], ['ETAPOD', 'eta'], ['SNO', null],
]);

export function parseDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m.map(Number);
    if (y < 100) y += 2000;
    const [mo, d] = a > 12 ? [b, a] : [a, b];          // M/D/YYYY, or D/M/YYYY when the first number cannot be a month
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

// Turns raw strings (form data or sheet cells) into a database row.
export function cleanRow(raw) {
  const out = {};
  for (const f of FIELDS) {
    const v = String(raw[f.key] ?? '').trim();
    if (f.date) out[f.key] = parseDate(v);
    else if (f.num) out[f.key] = /^\d+/.test(v) ? parseInt(v, 10) : null;
    else out[f.key] = v ? (UPPER.has(f.key) ? v.toUpperCase() : v) : null;
  }
  return out;
}

// Parses text pasted from Excel / Google Sheets (tab-separated, header row optional).
export function parseSheet(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const rows = lines.map((l) => l.split('\t').map((c) => c.trim()));

  let header = null;
  const first = rows[0].map(norm);
  if (first.includes('MBL') || first.includes('SHIPPERNAME') || first.includes('TRLNO')) {
    header = rows.shift().map((h) => ALIASES[norm(h)] ?? null);
  }
  const positional = FIELDS.map((f) => f.key);
  const out = [];
  for (let cells of rows) {
    let map = header;
    if (!map) {
      // No header: allow a leading serial-number column.
      map = cells.length >= positional.length + 1 ? [null, ...positional] : positional;
    } else if (cells.length < map.length) {
      // Empty cells can be lost in a paste; restore blanks at the container columns if that is what is missing.
      const at = map.indexOf('cntr_qnty');
      const missing = map.length - cells.length;
      if (at >= 0 && missing <= 2) cells = [...cells.slice(0, at), ...Array(missing).fill(''), ...cells.slice(at)];
    }
    const raw = {};
    map.forEach((k, i) => { if (k) raw[k] = cells[i]; });
    const row = cleanRow(raw);
    if (row.mbl || row.hbl || row.trl_no || row.shipper_name) out.push(row);
  }
  return out;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  const head = ['S NO', ...FIELDS.map((f) => f.label)].map(csvCell).join(',');
  const body = rows.map((r, i) => [i + 1, ...FIELDS.map((f) => r[f.key])].map(csvCell).join(','));
  return [head, ...body].join('\r\n');
}

export const isClosed = (r) => /closed|delivered/i.test(r.job_status || '');
export const broPending = (r) => r.bro === 'YES' && r.bro_received !== 'RECEIVED';
