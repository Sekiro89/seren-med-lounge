import { redirect } from 'next/navigation';

/** Visits now live under Appointments. */
export default function VisitsPage() {
  redirect('/appointments');
}
