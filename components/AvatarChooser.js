'use client';

import { useState } from 'react';
import { ALL_AVATARS } from '@/lib/avatars';

// Pick a profile picture from one list. Submits the chosen path as `avatar`.
export default function AvatarChooser({ defaultValue = '', name = 'avatar' }) {
  const [sel, setSel] = useState(defaultValue);

  return (
    <div className="ac">
      <input type="hidden" name={name} value={sel} />
      <div className="ac-grid">
        {ALL_AVATARS.map((src) => (
          <button key={src} type="button" className={`ac-opt ${sel === src ? 'sel' : ''}`} onClick={() => setSel(sel === src ? '' : src)} aria-pressed={sel === src} aria-label="Choose this picture">
            <img src={src} alt="" width="52" height="52" loading="lazy" />
          </button>
        ))}
      </div>
      <p className="sub">{sel ? 'Tap your picture again to remove it.' : 'No picture chosen. We will give you a friendly default.'}</p>
    </div>
  );
}
