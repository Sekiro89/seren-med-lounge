import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Next, Geist_Mono } from 'next/font/google';
import './globals.css';

// Atkinson Hyperlegible for all patient-facing text (design system 18.5);
// Geist Mono only for the queue token number.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: '--font-atkinson',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'SereneMed', template: '%s · SereneMed' },
  description: 'Your visits, medicines and results from SereneMed Lounge.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0c3d3e',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${atkinson.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
