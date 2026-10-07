'use client';

import { createContext, useContext } from 'react';
import type { StaffUser } from './auth';

const StaffContext = createContext<StaffUser | null>(null);

export const StaffProvider = StaffContext.Provider;

/** The signed-in staff member. Only available below AppShell. */
export function useStaff(): StaffUser {
  const user = useContext(StaffContext);
  if (!user) throw new Error('useStaff must be used inside AppShell.');
  return user;
}
