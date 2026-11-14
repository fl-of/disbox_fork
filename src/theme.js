import { createTheme, CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

const ThemeContext = createContext({
  mode: 'dark',
  isDark: true,
  setMode: () => {},
  toggle: () => {},
});

function getInitialMode() {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function AppThemeProvider({ children }) {
  const [mode, setModeState] = useState(getInitialMode);

  useEffect(() => {
    localStorage.setItem('theme', mode);
  }, [mode]);

  const setMode = useCallback((newMode) => {
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