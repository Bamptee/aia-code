import { BrandBlock } from './BrandBlock';
import { NewStoryButton } from './NewStoryButton';
import { NavLinks } from './NavLinks';
import { ActiveStoriesList } from './ActiveStoriesList';
import { UserCard } from './UserCard';

/**
 * Sidebar gauche, 260px de large, full height, background surface-2.
 * Contenu (de haut en bas) : Brand → New story → Nav → Active stories → User card.
 */
export function Sidebar() {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-surface-2">
      <div className="flex flex-col gap-4 p-4">
        <BrandBlock />
        <NewStoryButton />
      </div>
      <nav className="flex-1 overflow-y-auto px-3">
        <NavLinks />
        <ActiveStoriesList />
      </nav>
      <div className="p-3">
        <UserCard />
      </div>
    </aside>
  );
}
