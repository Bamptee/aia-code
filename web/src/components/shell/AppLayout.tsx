import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Root layout for the AIA workspace.
 * - Sidebar 260px fixed left (surface-2 background)
 * - Topbar 53px fixed top (surface background, border bottom)
 * - Main pane = router outlet (children)
 * - App min-width 1180px (desktop only, PRD §5)
 */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen min-w-[1180px] overflow-hidden bg-bg text-text">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
