import { Suspense } from 'react';
import { RoadmapView } from '@/components/roadmap/RoadmapView';

/**
 * Route /roadmap — Gantt 16 semaines (Epic 6, Story 6.1).
 *
 * Suspense boundary obligatoire : RoadmapView lit `useSearchParams`.
 */
export default function RoadmapPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-3">Loading roadmap…</div>}>
      <RoadmapView />
    </Suspense>
  );
}
