'use client';

import { useState } from 'react';

// Read-only link with one-tap copy, plus a WhatsApp share button.
export default function CopyLink({ url, shareText }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(url); }
    catch {
      const el = document.getElementById('join-link-input');
      el?.select(); document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="copylink">
      <input id="join-link-input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Join link" />
      <button type="button" className="btn primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
      <a className="btn" target="_blank" rel="noreferrer"
        href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`}>Share on WhatsApp</a>
    </div>
  );
}
