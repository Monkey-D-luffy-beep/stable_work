import './globals.css';

export const metadata = {
  title: 'Tiger Projects',
  description: 'Team task management for Tiger Logistics',
  icons: { icon: '/logo.png' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
