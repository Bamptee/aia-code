'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const LABELS: Record<string, string> = {
  '': 'Home',
  stories: 'Stories',
  roadmap: 'Roadmap',
  tasks: 'Tasks',
  settings: 'Settings',
};

/**
 * Breadcrumb left du Topbar (handoff §6).
 * Réflète la route courante. Story 3.x enrichira pour StoryWorkspace
 * (ex: "Stories / Magic link authentication").
 */
export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // Root case
  if (segments.length === 0) {
    return <span className="text-sm text-text-2">Home</span>;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const label = LABELS[seg] ?? decodeURIComponent(seg);
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-text-3" />}
            <span className={isLast ? 'text-text' : 'text-text-2'}>{label}</span>
          </span>
        );
      })}
    </nav>
  );
}
