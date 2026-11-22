import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ThemeSettingsRecord } from '@ngegame/shared';
import { backendService } from '../services/backendService.js';
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

function findAccentKeyByHex(hex: string): ThemeAccent {
  const lower = hex.toLowerCase();
  for (const [k, v] of Object.entries(ACCENT_MAP) as Array<[ThemeAccent, AccentPalette]>) {
    if (v.hex.toLowerCase() === lower) return k;
  }
  return 'overthinker';
}

interface ThemeContextValue {
  mode: ThemeMode;
  accent: ThemeAccent;
  palette: AccentPalette;
  customColors: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    accentColor: string;
    fontPreference: string;
  };
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (accent: ThemeAccent) => void;
  updateCustomTheme: (patch: Partial<ThemeSettingsRecord>) => Promise<void>;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(
  mode: string,
  accentColor: string,
  secondaryColor: string,
  backgroundColor?: string,
): void {
  const effectiveMode = mode === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', effectiveMode);
  document.documentElement.style.setProperty('--accent-primary', accentColor);
  document.documentElement.style.setProperty('--accent-secondary', secondaryColor);
  if (mode === 'custom' && backgroundColor) {
    document.documentElement.style.setProperty('--bg-main', backgroundColor);
  } else {
    document.documentElement.style.removeProperty('--bg-main');
  }
  try {
    localStorage.setItem('ngegame-theme-mode', effectiveMode);
    localStorage.setItem(
      'ngegame-theme-snapshot',
      JSON.stringify({ mode, accentColor, secondaryColor, backgroundColor }),
    );
  } catch {
    // ignore storage quota errors
  }
}

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
    return 'overthinker';
  });

  const [customColors, setCustomColors] = useState(() => ({
    primaryColor: ACCENT_MAP.overthinker.hex,
    secondaryColor: '#6366f1',
    backgroundColor: '#0a0e09',
    accentColor: ACCENT_MAP.overthinker.hex,
    fontPreference: 'system',
  }));

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sinkronkan tema dari SQLite saat aplikasi dibuka
  useEffect(() => {
    let active = true;
    void backendService
      .getThemeSettings()
      .then((remote) => {
        if (!active) return;
        const resolvedMode: ThemeMode = remote.mode === 'light' ? 'light' : 'dark';
        const resolvedAccent = findAccentKeyByHex(remote.accentColor);
        setModeState(resolvedMode);
        setAccentState(resolvedAccent);
        setCustomColors({
          primaryColor: remote.primaryColor,
          secondaryColor: remote.secondaryColor,
          backgroundColor: remote.backgroundColor,
          accentColor: remote.accentColor,
          fontPreference: remote.fontPreference,
        });
        applyThemeToDocument(
          remote.mode,
          remote.accentColor,
          remote.secondaryColor,
          remote.backgroundColor,
        );
      })
      .catch(() => {
        // Fallback ke localStorage jika backend belum siap
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(
      mode,
      customColors.accentColor || ACCENT_MAP[accent].hex,
      customColors.secondaryColor,
      customColors.backgroundColor,
    );
  }, [mode, accent, customColors]);

  const setMode = (next: ThemeMode): void => {
    setModeState(next);
    localStorage.setItem('ngegame-theme-mode', next);
    void backendService.updateThemeSettings({ mode: next }).catch(() => undefined);
  };

  const toggleMode = (): void => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
  };

  const setAccent = (next: ThemeAccent): void => {
    const hex = ACCENT_MAP[next].hex;
    setAccentState(next);
    setCustomColors((prev) => ({ ...prev, accentColor: hex, primaryColor: hex }));
    localStorage.setItem('ngegame-accent', next);
    void backendService
      .updateThemeSettings({ accentColor: hex, primaryColor: hex })
      .catch(() => undefined);
  };

  const updateCustomTheme = async (patch: Partial<ThemeSettingsRecord>): Promise<void> => {
    const updated = await backendService.updateThemeSettings(patch);
    const resolvedMode: ThemeMode = updated.mode === 'light' ? 'light' : 'dark';
    setModeState(resolvedMode);
    setAccentState(findAccentKeyByHex(updated.accentColor));
    setCustomColors({
      primaryColor: updated.primaryColor,
      secondaryColor: updated.secondaryColor,
      backgroundColor: updated.backgroundColor,
      accentColor: updated.accentColor,
      fontPreference: updated.fontPreference,
    });
    applyThemeToDocument(
      updated.mode,
      updated.accentColor,
      updated.secondaryColor,
      updated.backgroundColor,
    );
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
        customColors,
        setMode,
        toggleMode,
        setAccent,
        updateCustomTheme,
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
