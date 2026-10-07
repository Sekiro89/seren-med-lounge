'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { usePathname } from 'next/navigation';

interface Crumb {
  path: string;
  label: string;
}

const CrumbContext = createContext<Dispatch<SetStateAction<Crumb | null>> | null>(null);
const CrumbValue = createContext<Crumb | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [crumb, setCrumb] = useState<Crumb | null>(null);
  return (
    <CrumbContext.Provider value={setCrumb}>
      <CrumbValue.Provider value={crumb}>{children}</CrumbValue.Provider>
    </CrumbContext.Provider>
  );
}

/**
 * A detail page names itself in the context row's breadcrumb
 * ("Patients / Pooja Deshpande"). Pass undefined while loading. The label
 * belongs to the current path only, so it never leaks onto the next page.
 */
export function usePageCrumb(label: string | undefined) {
  const set = useContext(CrumbContext);
  const pathname = usePathname();
  useEffect(() => {
    if (!set || !label) return;
    set({ path: pathname, label });
    return () => set((current) => (current?.path === pathname ? null : current));
  }, [set, label, pathname]);
}

/** The page-supplied label for the current path, if any. */
export function useCurrentCrumb(): string | undefined {
  const crumb = useContext(CrumbValue);
  const pathname = usePathname();
  return crumb?.path === pathname ? crumb.label : undefined;
}
