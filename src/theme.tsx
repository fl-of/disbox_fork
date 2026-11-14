import { createTheme, CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'light' | 'dark';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#5865f2' },
  },
  shape: { borderRadius: 10 },
});

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#5865f2' },
  },
  shape: { borderRadius: 10 },
});

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  isDark: true,
  setMode: () => {},
  toggle: () => {},
});

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);

  useEffect(() => {
    localStorage.setItem('theme', mode);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = useCallback(() => {
    setModeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ mode, isDark: mode === 'dark', setMode, toggle }),
    [mode, setMode, toggle]
  );

  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
