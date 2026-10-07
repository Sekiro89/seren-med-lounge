'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffUser } from '../lib/auth';
import { homeFor } from '../lib/nav';

/** Signed in: straight to your role's home. Otherwise: the sign-in page. */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = getStaffUser();
    router.replace(user ? homeFor(user.role) : '/login');
  }, [router]);

  return null;
}
