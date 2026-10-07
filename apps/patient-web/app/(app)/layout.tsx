import type { ReactNode } from 'react';
import { PatientShell } from '../../components/shell';

/** Every signed-in page: top bar, bottom tabs on phones, session check. */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return <PatientShell>{children}</PatientShell>;
}
