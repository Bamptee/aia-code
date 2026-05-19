import { Composer } from '@/components/home/Composer';
import { RecentStories } from '@/components/home/RecentStories';

/**
 * Home page (FR-5 + FR-6) :
 * - Greeting + composer pour créer une story
 * - Shortlist des 8 stories récentes
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-text">
        Bonjour Anthony
      </h1>
      <p className="mt-2 text-sm text-text-2">
        Qu&apos;est-ce qu&apos;on construit aujourd&apos;hui ?
      </p>
      <div className="mt-8">
        <Composer />
      </div>
      <RecentStories />
    </div>
  );
}
