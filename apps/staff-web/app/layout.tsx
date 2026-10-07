import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import { IconWeight } from '../components/icon-weight';
import './globals.css';

// Clinical Ink type (design system 3): Plex Sans for the UI, Plex Mono for
// every number and code, Plex Serif for the one page title per page.
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  weight: ['400', '500', '600'],
  subsets: ['latin'],
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  weight: ['400', '500', '600'],
  subsets: ['latin'],
});

const plexSerif = IBM_Plex_Serif({
  variable: '--font-plex-serif',
  weight: ['500'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  description: 'Role-based workspaces for the SereneMed clinic team.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${plexSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <IconWeight>{children}</IconWeight>
      </body>
    </html>
  );
}
