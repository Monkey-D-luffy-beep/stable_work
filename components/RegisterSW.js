'use client';

import { useEffect } from 'react';

// Quietly turns on offline support and makes the browser treat this as an installable app.
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
