/**
 * ThemeContext — thin compatibility shim.
 * Theme is now owned by UserProfileContext.
 * This file re-exports a useTheme hook that reads/writes through UserProfileContext
 * so legacy consumers (ThemeToggle, etc.) keep working without changes.
 */
import { useProfile } from './UserProfileContext';

export type Theme = 'dark' | 'light';

export function useTheme() {
  const { profile, setField } = useProfile();
  return {
    theme: profile.theme as Theme,
    toggleTheme: () => {
      const next = profile.theme === 'dark' ? 'light' : 'dark';
      setField('theme', next);
      document.documentElement.setAttribute('data-theme', next);
    },
  };
}

// No-op provider kept so old import paths don't break
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import React from 'react';
