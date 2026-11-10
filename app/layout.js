import { Plus_Jakarta_Sans } from 'next/font/google';
import RegisterSW from '@/components/RegisterSW';
import './globals.css';

const font = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font' });

export const metadata = {
  title: 'Stableworks: team project management',
  description: 'Teams, tasks, reviews and weekly reports in one place.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Stableworks' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2b214a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={font.variable}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
