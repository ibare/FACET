/**
 * 사용자 환경설정 — 테마(light/dark) + locale.
 *
 * - 테마: <html class="dark"> 토글로 Tailwind 다크모드 활성화. localStorage 영속.
 *   초기값: localStorage → prefers-color-scheme → 'dark' fallback.
 * - locale: facet 실행 시 runFacet 옵션으로 전달. 기본 'en'.
 *
 * locale 을 바꾸면 그 언어의 프레임워크 문구 번들을 함께 불러온다. 번들은
 * 동적 import 라 도착이 늦으므로, 도착했다는 사실을 `messagesEpoch` 로 알려
 * 화면이 다시 그려지게 한다 — 그러지 않으면 이미 렌더된 컨트롤 라벨이 영어
 * fallback 인 채로 남는다.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadFrameworkMessages } from '@ffacet/bootstrap';

export type Theme = 'light' | 'dark';
export type Locale = 'en' | 'ko';

type PreferencesContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  /**
   * 문구 번들이 새로 도착할 때마다 오르는 값.
   *
   * 번들은 registry 에 등록될 뿐 React 상태가 아니라, 이것을 의존성에 넣어야
   * 도착 시점에 facet 이 다시 마운트된다.
   */
  messagesEpoch: number;
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
  const [messagesEpoch, setMessagesEpoch] = useState(0);

  useEffect(() => {
    applyThemeToHtml(theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void loadFrameworkMessages(locale).then(() => {
      if (!cancelled) setMessagesEpoch((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);
  const toggleTheme = useCallback(() => setThemeState((p) => (p === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo<PreferencesContextValue>(
    () => ({ theme, setTheme, toggleTheme, locale, setLocale, messagesEpoch }),
    [theme, setTheme, toggleTheme, locale, setLocale, messagesEpoch],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences 는 PreferencesProvider 내부에서만 호출 가능');
  return ctx;
}
