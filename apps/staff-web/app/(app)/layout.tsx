import type { ReactNode } from 'react';
import { AppShell } from '../../components/shell/app-shell';

/** Every page in this group gets the signed-in shell (sidebar, top bar). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
