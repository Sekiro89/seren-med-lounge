import Link from 'next/link';
import { Button } from '@serenemed/ui';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">SereneMed Lounge</h1>
      <p className="max-w-sm text-slate-600">
        Your appointments, diagnoses, prescriptions, and lab results — all in one place.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link href="/signup" className="w-full">
          <Button className="w-full py-2.5">Create an account</Button>
        </Link>
        <Link href="/login" className="w-full">
          <Button variant="secondary" className="w-full py-2.5">
            Sign in
          </Button>
        </Link>
      </div>
    </main>
  );
}
