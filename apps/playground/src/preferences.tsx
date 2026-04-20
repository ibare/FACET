/**
 * 사용자 환경설정 — 테마(light/dark) + locale.
 *
 * - 테마: <html class="dark"> 토글로 Tailwind 다크모드 활성화. localStorage 영속.
 *   초기값: localStorage → prefers-color-scheme → 'dark' fallback.
 * - locale: facet 실행 시 runFacet 옵션으로 전달. 기본 'en'.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
export type Locale = 'en' | 'ko';

type PreferencesContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
};

const THEME_KEY = 'facet:theme';
const LOCALE_KEY = 'facet:locale';

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LOCALE_KEY);
  if (stored === 'en' || stored === 'ko') return stored;
  return 'en';
}

function applyThemeToHtml(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  useEffect(() => {
    applyThemeToHtml(theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);
  const toggleTheme = useCallback(() => setThemeState((p) => (p === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo<PreferencesContextValue>(
    () => ({ theme, setTheme, toggleTheme, locale, setLocale }),
    [theme, setTheme, toggleTheme, locale, setLocale],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences 는 PreferencesProvider 내부에서만 호출 가능');
  return ctx;
}
