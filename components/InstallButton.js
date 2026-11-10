'use client';

import { useEffect, useState } from 'react';

// Shows a one-tap "Install app" button on Android/desktop Chrome, once the browser says the site is
// installable. iPhone has no such prompt; those people use Safari's Share → Add to Home Screen instead.
export default function InstallButton({ className = '', children = 'Install app' }) {
  const [evt, setEvt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setEvt(e); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (window.matchMedia?.('(display-mode: standalone)').matches) setInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !evt) return null;
  return (
    <button type="button" className={className} onClick={async () => { evt.prompt(); await evt.userChoice; setEvt(null); }}>
      {children}
    </button>
  );
}
