'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeProvider';

/**
 * Sun/moon toggle button (handoff §6). FR-2 partiel — toggle theme persistant.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggleTheme}
      className="flex h-8 w-8 items-center justify-center rounded text-text-2 transition-colors hover:bg-surface-hover hover:text-text"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
