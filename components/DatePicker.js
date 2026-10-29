'use client';

import { useState } from 'react';
import { addDays, parseISO, toISO, weekStartOf } from '@/lib/timeline';

const nice = (s) => parseISO(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// A date field with one-tap shortcuts. Works controlled (value/onChange) or as a plain form field (name/defaultValue).
export default function DatePicker({ value, defaultValue = '', onChange, name, disabled = false, label = 'Date', min }) {
  const [inner, setInner] = useState(defaultValue || '');
  const val = value !== undefined ? value || '' : inner;
  const set = (v) => { setInner(v); onChange?.(v); };

  const now = new Date();
  const shortcuts = [
    ['Today', toISO(now)],
    ['Tomorrow', toISO(addDays(now, 1))],
    ['Next Mon', toISO(addDays(weekStartOf(now), 7))],
    ['+1 week', toISO(addDays(now, 7))],
  ];

  return (
    <div className="dp">
      <input type="date" name={name} value={val} min={min} disabled={disabled} aria-label={label} onChange={(e) => set(e.target.value)} />
      {val && <span className="dp-nice">{nice(val)}</span>}
      {!disabled && (
        <div className="dp-chips">
          {shortcuts.map(([text, v]) => (
            <button key={text} type="button" className={`dp-chip ${val === v ? 'on' : ''}`} onClick={() => set(v)}>{text}</button>
          ))}
          {val && <button type="button" className="dp-chip clear" onClick={() => set('')}>Clear</button>}
        </div>
      )}
    </div>
  );
}
