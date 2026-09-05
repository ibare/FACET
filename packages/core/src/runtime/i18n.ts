/**
 * 메시지 카탈로그 — 화면 문자열의 다국어 해석.
 *
 * ── 왜 LocaleStr 인라인이 아닌가
 *
 * `LocaleStr` (`{ en, ko }`) 은 facet.ts 의 title 처럼 **저작자가 소스에 직접
 * 쓰는 소수의 값** 에는 적합하다. 그러나 view / projector 가 그리는 화면 문자열은
 * 수백 건이고, 번역은 호스트의 번역 파이프라인이 생성한다. 인라인이면 번역이
 * 소스 수정으로만 들어와 갱신마다 FACET 재발행이 필요하다.
 *
 * 그래서 소스에는 **en 원본만** 두고 (fallback 겸 번역 추출 원본), 나머지 언어는
 * 런타임에 번들로 주입한다. 호스트 언어 팩의 translationTargets 가 en 을 제외한
 * 목록인 것과 같은 구조다 — en 이 원본이고 나머지는 파생이다.
 *
 * ── 키 규약
 *
 *   <namespace>.<area>.<name>     모두 lowerCamelCase 세그먼트
 *
 *   facet 고유    stack.caption.push      / stack.label.top
 *   빌트인 view   view.controlBar.play    / view.codeView.addLanguage
 *
 * namespace 는 facet id 의 `facet:` 접두사를 뗀 형태, 또는 빌트인 view 를 뜻하는
 * `view`. 키가 겹치면 나중 등록이 이긴다.
 *
 * ── 사용
 *
 *   const t = makeTranslator(params.locale);      // View — params.locale 사용
 *   t('stack.label.top', 'Top')
 *
 *   runtime.t('stack.caption.push', 'Placed a new box on top — {value}', { value })
 *                                                 // Projector — runner 가 주입
 */

/** 키 → 번역문. 한 locale 의 번들. */
export type MessageBundle = Record<string, string>;

/**
 * 메시지 조회 함수.
 *
 * @param key      메시지 키.
 * @param fallback en 원본. 번들에 키가 없거나 locale 이 en 일 때 쓰인다.
 *                 소스에 남아 있어야 추출기가 번역 원본을 모을 수 있다.
 * @param vars     `{name}` 플레이스홀더 치환값. 어순이 다른 언어를 위해
 *                 문자열 이어붙이기 대신 플레이스홀더를 쓴다.
 */
export type Translate = (
  key: string,
  fallback: string,
  vars?: Record<string, string | number>,
) => string;

const bundles = new Map<string, MessageBundle>();

/** 기준 언어. 이 locale 은 번들을 보지 않고 언제나 소스의 fallback 을 쓴다. */
export const SOURCE_LOCALE = 'en';

/**
 * 한 locale 의 메시지 번들을 등록한다. 같은 locale 로 여러 번 호출하면 병합되며,
 * 같은 키는 나중 값이 이긴다 (facet 별로 나눠 주입할 수 있게).
 */
export function registerMessages(locale: string, bundle: MessageBundle): void {
  const existing = bundles.get(locale);
  bundles.set(locale, existing ? { ...existing, ...bundle } : { ...bundle });
}

/** 등록된 번들이 있는 locale 목록. */
export function listMessageLocales(): string[] {
  return [...bundles.keys()];
}

/** 테스트/재부팅용 — 등록된 번들을 모두 비운다. */
export function clearMessages(): void {
  bundles.clear();
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  let out = text;
  for (const [name, value] of Object.entries(vars)) {
    out = out.split(`{${name}}`).join(String(value));
  }
  return out;
}

/**
 * 주어진 locale 로 해석하는 조회 함수를 만든다.
 *
 * locale 이 없거나 SOURCE_LOCALE 이거나 번들이 없으면 fallback (en 원본) 을
 * 그대로 쓴다. 즉 번역이 하나도 등록되지 않아도 화면은 en 으로 온전히 동작한다.
 */
export function makeTranslator(locale?: string): Translate {
  const bundle = locale && locale !== SOURCE_LOCALE ? bundles.get(locale) : undefined;
  return (key, fallback, vars) => interpolate(bundle?.[key] ?? fallback, vars);
}
