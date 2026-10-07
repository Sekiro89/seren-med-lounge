'use client';

import { useEffect, useState } from 'react';
import { SESSION_EXPIRED_KEY } from '../../lib/api-client';

/** Shown on /login after a 401 sent the user back; read once, then cleared. */
export function SessionNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_EXPIRED_KEY)) {
        window.sessionStorage.removeItem(SESSION_EXPIRED_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShow(true);
      }
    } catch {
      // storage blocked
    }
  }, []);
  if (!show) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-sm rounded-control border border-line bg-warning-bg px-4 py-3 text-sm text-warning-fg shadow-popover"
    >
      Your session expired. Please sign in again.
    </div>
  );
}
