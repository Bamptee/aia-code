'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './client';

/**
 * Wraps the app with QueryClientProvider. The QueryClient is created once per
 * component instance (via useState lazy init) — survives strict-mode remounts
 * but doesn't leak between tabs/sessions.
 */
export function ApiProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
