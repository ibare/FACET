/**
 * Shiki highlighter — 모듈 단위 싱글톤. 첫 호출 시 생성, 이후 lazy 로 언어 로드.
 *
 * 우리 프로젝트의 transpiler.language 값과 Shiki bundledLanguages 키가
 * 우연이 아니라 의도적으로 동일하다 (python/javascript/typescript/java/cpp/csharp).
 */

import { createHighlighter, type Highlighter } from 'shiki';

export const SHIKI_THEMES = ['github-light', 'github-dark'] as const;
export type ShikiThemeName = (typeof SHIKI_THEMES)[number];

let highlighterPromise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: SHIKI_THEMES as unknown as string[],
      langs: [],
    });
  }
  return highlighterPromise;
}

export async function ensureLanguage(lang: string): Promise<Highlighter> {
  const hl = await getHighlighter();
  if (!hl.getLoadedLanguages().includes(lang)) {
    await hl.loadLanguage(lang as never);
  }
  return hl;
}
