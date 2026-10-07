import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionNotice } from '../../components/shell/session-notice';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionNotice />
      {children}
    </>
  );
}
