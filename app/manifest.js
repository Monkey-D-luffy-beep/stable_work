// Makes the site installable as an app on a phone (Android: one-tap install; iPhone: Share → Add to Home Screen).
export default function manifest() {
  return {
    name: 'Stableworks',
    short_name: 'Stableworks',
    description: 'Teams, tasks, reviews and weekly reports in one place.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f5fb',
    theme_color: '#2b214a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
