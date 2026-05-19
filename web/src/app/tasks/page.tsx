import { Suspense } from 'react';
import { TasksView } from '@/components/tasks/TasksView';

/**
 * Route /tasks — Two-pane Tasks view (Epic 5).
 *
 * Suspense boundary obligatoire : TasksView lit `useSearchParams` ce qui force
 * Next.js 16 à opter-out du static rendering pour cette route. Le boundary
 * supprime le warning build et permet streaming.
 */
export default function TasksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-3">Loading tasks…</div>}>
      <TasksView />
    </Suspense>
  );
}
