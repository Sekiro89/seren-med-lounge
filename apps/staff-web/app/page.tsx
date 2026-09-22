import Link from 'next/link';
import { Button } from '@serenemed/ui';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">SereneMed Lounge — Staff</h1>
      <p className="max-w-sm text-slate-600">
        Role-based workspaces. See workspaces/ for the eleven role folders — the doctor consultation
        workflow (dashboard → check-in → vitals/diagnoses/prescriptions/lab orders) is the first one
        wired up to a real backend.
      </p>
      <Link href="/login">
        <Button>Staff sign in</Button>
      </Link>
    </main>
  );
}
