'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type Accent = 'neutral' | 'indigo' | 'forest' | 'rust';

interface ThemeContextValue {
  theme: Theme;
  accent: Accent;
  setTheme: (t: Theme) => void;
  setAccent: (a: Accent) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Theme + Accent provider for the AIA workspace.
 *
 * SSR default is "dark" (set on <html> in app/layout.tsx). An inline script
 * in <head> (lib/theme/script.ts) overrides this before React hydration if
 * the user has a localStorage preference. This provider then reads the
 * final values from <html>.dataset on mount and exposes setters that update
 * localStorage + <html>.dataset + React state, keeping all three in sync.
 *
 * Architecture decision D7 (revised post-party-mode) : React Context here,
 * not Zustand. Two values, no need for a global store yet.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize matching SSR defaults; useEffect hydrates from DOM dataset.
  const [theme, setThemeState] = useState<Theme>('dark');
  const [accent, setAccentState] = useState<Accent>('neutral');

  /*
   * setState in useEffect is the canonical pattern for hydrating React state
   * from DOM dataset post-SSR. The inline <head> script may have updated
   * data-theme/data-accent before React hydration. We sync the React state
   * to match. Without this, useTheme() would return the SSR default forever
   * even if the user has a different localStorage preference.
   *
   * react-hooks/set-state-in-effect flags this pattern; for DOM sync on
   * mount it's a legitimate exception.
   */
  useEffect(() => {
    const root = document.documentElement;
    const t = root.dataset.theme;
    const a = root.dataset.accent;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t === 'light' || t === 'dark') setThemeState(t);
    if (a === 'neutral' || a === 'indigo' || a === 'forest' || a === 'rust') {
      setAccentState(a);
    }
  }, []);

  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('theme', t); } catch { /* localStorage may be unavailable */ }
    setThemeState(t);
  };

  const setAccent = (a: Accent) => {
    document.documentElement.dataset.accent = a;
    try { localStorage.setItem('accent', a); } catch { /* localStorage may be unavailable */ }
    setAccentState(a);
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return ctx;
}
