import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ThemeAccent, ThemeMode } from '../types/dashboard.js';

interface AccentPalette {
  name: string;
  hex: string;
  primaryBg: string;
  primaryText: string;
  primaryBorder: string;
  ringClass: string;
}

const ACCENT_MAP: Record<ThemeAccent, AccentPalette> = {
  violet: {
    name: 'Studio Violet',
    hex: '#8B5CF6',
    primaryBg: 'bg-violet-500/15',
    primaryText: 'text-violet-400',
    primaryBorder: 'border-violet-500/45',
    ringClass: 'ring-violet-500/30',
  },
  cyan: {
    name: 'Electric Sky',
    hex: '#38BDF8',
    primaryBg: 'bg-sky-500/15',
    primaryText: 'text-sky-400',
    primaryBorder: 'border-sky-500/45',
    ringClass: 'ring-sky-500/30',
  },
  emerald: {
    name: 'Emerald Studio',
    hex: '#22C55E',
    primaryBg: 'bg-emerald-500/15',
    primaryText: 'text-emerald-400',
    primaryBorder: 'border-emerald-500/45',
    ringClass: 'ring-emerald-500/30',
  },
  overthinker: {
    name: 'Overthinker Olive',
    hex: '#6F9C4E',
    primaryBg: 'bg-[#394f29]/25',
    primaryText: 'text-[#8bc34a]',
    primaryBorder: 'border-[#6f9c4e]/50',
    ringClass: 'ring-[#6f9c4e]/30',
  },
};

interface ThemeContextValue {
  mode: ThemeMode;
  accent: ThemeAccent;
  palette: AccentPalette;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (accent: ThemeAccent) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('ngegame-theme-mode');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [accent, setAccentState] = useState<ThemeAccent>(() => {
    const saved = localStorage.getItem('ngegame-accent');
    if (
      saved === 'violet' ||
      saved === 'cyan' ||
      saved === 'emerald' ||
      saved === 'overthinker'
    ) {
      return saved;
    }
    return 'violet';
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('ngegame-theme-mode', mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-primary', ACCENT_MAP[accent].hex);
  }, [accent]);

  const setMode = (next: ThemeMode): void => {
    setModeState(next);
  };

  const toggleMode = (): void => {
    setModeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setAccent = (next: ThemeAccent): void => {
    setAccentState(next);
    localStorage.setItem('ngegame-accent', next);
  };

  const toggleSidebar = (): void => {
    setSidebarCollapsed((prev) => !prev);
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        accent,
        palette: ACCENT_MAP[accent],
        setMode,
        toggleMode,
        setAccent,
        sidebarCollapsed,
        toggleSidebar,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
