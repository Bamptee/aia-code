import { Search, Bell } from 'lucide-react';
import { Breadcrumb } from './Breadcrumb';
import { ThemeToggle } from './ThemeToggle';

/**
 * Topbar 53px, surface background, border bottom.
 * Left : breadcrumb. Right : search + theme toggle + bell.
 */
export function Topbar() {
  return (
    <header className="flex h-[53px] shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <Breadcrumb />
      <div className="flex items-center gap-1">
        <IconButton aria-label="Search">
          <Search size={16} />
        </IconButton>
        <ThemeToggle />
        <IconButton aria-label="Notifications">
          <Bell size={16} />
        </IconButton>
      </div>
    </header>
  );
}

function IconButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="flex h-8 w-8 items-center justify-center rounded text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
      {...props}
    >
      {children}
    </button>
  );
}
