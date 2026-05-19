'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Library, Map, ListChecks, Settings, type LucideIcon } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { href: '/', label: 'Home', Icon: House },
  { href: '/stories', label: 'Stories', Icon: Library },
  { href: '/roadmap', label: 'Roadmap', Icon: Map },
  { href: '/tasks', label: 'Tasks', Icon: ListChecks },
  { href: '/settings', label: 'Settings', Icon: Settings },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <li key={href}>
            <Link
              href={href}
              className={
                'flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ' +
                (active
                  ? 'bg-surface font-semibold text-text shadow-sm'
                  : 'text-text-2 hover:bg-surface-hover hover:text-text')
              }
            >
              <Icon size={14} />
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
