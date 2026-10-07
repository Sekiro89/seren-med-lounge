import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Next, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Atkinson Hyperlegible for all patient-facing text (design system 18.5);
// IBM Plex Mono for the token, result values and times (Clinical Ink figures).
const atkinson = Atkinson_Hyperlegible_Next({
  variable: '--font-atkinson',
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
    <html lang="en" className={`${atkinson.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
