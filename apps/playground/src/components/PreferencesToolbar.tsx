/**
 * 헤더 우측의 테마/언어 토글 묶음.
 * Playground 두 페이지(IndexPage, FacetPage) 에서 공용.
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Sun, Moon, Translate, Check } from '@phosphor-icons/react';
import { usePreferences, type Locale } from '../preferences.js';

const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
};

export function PreferencesToolbar() {
  const { theme, toggleTheme, locale, setLocale } = usePreferences();
  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'switch to light theme' : 'switch to dark theme'}
        title={theme === 'dark' ? 'Light' : 'Dark'}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface-raised text-fg-muted ring-1 ring-border transition hover:bg-surface-raised-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
      >
        <ThemeIcon weight="duotone" className="h-4 w-4" />
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="select language"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-raised px-2.5 text-fg-muted ring-1 ring-border transition hover:bg-surface-raised-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/30"
          >
            <Translate weight="duotone" className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">{locale}</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={6}
            align="end"
            className="z-50 min-w-[140px] overflow-hidden rounded-lg bg-surface p-1 text-fg shadow-xl ring-1 ring-border"
          >
            {(Object.keys(LOCALE_LABEL) as Locale[]).map((code) => (
              <DropdownMenu.Item
                key={code}
                onSelect={() => setLocale(code)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-raised"
              >
                <span>{LOCALE_LABEL[code]}</span>
                {locale === code && <Check weight="bold" className="h-3.5 w-3.5 text-fg-muted" />}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
