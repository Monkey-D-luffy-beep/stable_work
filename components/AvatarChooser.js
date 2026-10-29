'use client';

import { useState } from 'react';
import { AVATAR_SETS, avatarsOf } from '@/lib/avatars';

// Pick a profile picture from the ready-made sets. Submits the chosen path as `avatar`.
export default function AvatarChooser({ defaultValue = '', name = 'avatar' }) {
  const [sel, setSel] = useState(defaultValue);
  const startSet = AVATAR_SETS.find((s) => avatarsOf(s).includes(defaultValue))?.id || AVATAR_SETS[0].id;
  const [tab, setTab] = useState(startSet);
  const set = AVATAR_SETS.find((s) => s.id === tab);

  return (
    <div className="ac">
      <input type="hidden" name={name} value={sel} />
      <div className="ac-tabs" role="tablist">
        {AVATAR_SETS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} className={tab === s.id ? 'on' : ''} onClick={() => setTab(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="ac-grid">
        {avatarsOf(set).map((src) => (
          <button key={src} type="button" className={`ac-opt ${sel === src ? 'sel' : ''}`} onClick={() => setSel(sel === src ? '' : src)} aria-pressed={sel === src} aria-label="Choose this picture">
            <img src={src} alt="" width="52" height="52" loading="lazy" />
          </button>
        ))}
      </div>
      <p className="sub">{sel ? 'Tap your picture again to remove it.' : 'No picture chosen. We will give you a friendly default.'}</p>
    </div>
  );
}
