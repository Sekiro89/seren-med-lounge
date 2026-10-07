'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPatientToken } from '../lib/auth';

/** The bare address: signed-in patients go Home, everyone else to sign in. */
export default function Root() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getPatientToken() ? '/home' : '/login');
  }, [router]);
  return null;
}
