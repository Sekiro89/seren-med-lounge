import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

// The same fonts as the staff app (design system 3): IBM Plex Sans for text,
// IBM Plex Mono for the token, result values, times and money. No serif here.
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  weight: ['400', '500', '600'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'SereneMed', template: '%s · SereneMed' },
  description: 'Your visits, medicines and results from SereneMed Lounge.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
