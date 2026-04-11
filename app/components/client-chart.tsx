'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Delays rendering children until after mount to prevent recharts measuring -1 dimensions during hydration. */
export default function ClientChart({ children, height = '100%' }: { children: ReactNode; height?: string | number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div style={{ width: '100%', height }} />;
  }

  return <>{children}</>;
}
