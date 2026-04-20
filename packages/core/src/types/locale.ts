/**
 * 다국어 문자열 타입 + 해석 헬퍼.
 *
 * facet 의 사용자 노출 텍스트(title/description/label/...)에 적용한다.
 * - `string` 형태는 모든 locale 에 동일 적용 (단일 언어 facet 호환).
 * - 객체 형태 `{ ko: '...', en: '...' }` 는 요청 locale → DEFAULT_LOCALE → 첫 키 순으로 해석.
 */

export type LocaleStr = string | Partial<Record<string, string>>;

export const DEFAULT_LOCALE = 'en';

export function resolveLocale(
  value: LocaleStr | undefined,
  locale?: string,
): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  const target = locale ?? DEFAULT_LOCALE;
  if (value[target] !== undefined) return value[target] as string;
  if (value[DEFAULT_LOCALE] !== undefined) return value[DEFAULT_LOCALE] as string;
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (v !== undefined) return v;
  }
  return '';
}
