'use client';

import { use } from 'react';
import { Inbox } from '../_components/inbox';

export default function MessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Inbox selectedId={id} />;
}
