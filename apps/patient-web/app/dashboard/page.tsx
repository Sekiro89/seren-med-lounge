import { redirect } from 'next/navigation';

/** The first draft's address; old bookmarks land on Home. */
export default function OldDashboard() {
  redirect('/home');
}
