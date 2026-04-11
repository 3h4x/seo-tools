'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface RefreshContextValue {
  refreshing: boolean;
  triggerRefresh: () => void;
  markDone: () => void;
  lastUpdated: number | null;
}

const RefreshContext = createContext<RefreshContextValue>({
  refreshing: false,
  triggerRefresh: () => {},
  markDone: () => {},
  lastUpdated: null,
});

export function useRefresh() {
  return useContext(RefreshContext);
}

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const router = useRouter();

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('seo-tools:lastUpdated');
    if (stored) {
      setLastUpdated(parseInt(stored, 10));
    } else {
      // Set to now if not previously stored
      const now = Date.now();
      setLastUpdated(now);
      localStorage.setItem('seo-tools:lastUpdated', now.toString());
    }
  }, []);

  const triggerRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetch('/api/cache', { method: 'DELETE' });
    // Update timestamp after refresh
    const now = Date.now();
    setLastUpdated(now);
    localStorage.setItem('seo-tools:lastUpdated', now.toString());
    router.refresh();
  }, [router]);

  const markDone = useCallback(() => {
    setRefreshing(false);
  }, []);

  return (
    <RefreshContext.Provider value={{ refreshing, triggerRefresh, markDone, lastUpdated }}>
      {children}
    </RefreshContext.Provider>
  );
}
