// Calendar-timeline layout: weeks as rows, days as columns, tasks as bars from start to deadline.

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => new Date(`${s}T00:00:00`);
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const weekStartOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

// A task covers start_date (or the day it was created) through its deadline. Tasks with no deadline have no span.
export function taskSpan(t) {
  if (!t.deadline) return null;
  let start = t.start_date || (t.created_at ? toISO(new Date(t.created_at)) : t.deadline);
  if (start > t.deadline) start = t.deadline;
  return { start, end: t.deadline };
}

// Positions the bars for one week row. Columns are 0-based; lanes stack overlapping bars.
export function layoutWeek(tasks, weekStart, showWeekend) {
  const n = showWeekend ? 7 : 5;
  const days = Array.from({ length: n }, (_, i) => toISO(addDays(weekStart, i)));
  const first = days[0], last = days[n - 1];

  const bars = [];
  for (const task of tasks) {
    const span = taskSpan(task);
    if (!span || span.end < first || span.start > last) continue;
    const s = span.start < first ? first : span.start;
    const e = span.end > last ? last : span.end;
    const cs = days.findIndex((d) => d >= s);
    let ce = -1;
    days.forEach((d, i) => { if (d <= e) ce = i; });
    if (cs < 0 || ce < cs) continue;
    bars.push({ task, cs, ce, contLeft: span.start < first, contRight: span.end > last });
  }

  bars.sort((a, b) => a.cs - b.cs || (b.ce - b.cs) - (a.ce - a.cs));
  const lanes = [];
  for (const bar of bars) {
    let lane = lanes.findIndex((end) => end < bar.cs);
    if (lane === -1) { lane = lanes.length; lanes.push(bar.ce); } else lanes[lane] = bar.ce;
    bar.lane = lane;
  }
  return { days, bars, laneCount: Math.max(1, lanes.length) };
}
