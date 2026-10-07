'use client';

import type { ReactNode } from 'react';
import { IconContext } from '@phosphor-icons/react';

/** Phosphor Light everywhere unless a component asks otherwise (design system 5). */
export function IconWeight({ children }: { children: ReactNode }) {
  return <IconContext.Provider value={{ weight: 'light' }}>{children}</IconContext.Provider>;
}
