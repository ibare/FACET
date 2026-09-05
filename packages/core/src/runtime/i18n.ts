/**
 * 메시지 카탈로그 — 프레임워크 공통 문구의 다국어 해석.
 *
 * ── 무엇이 여기 있고 무엇이 없는가
 *
 * facet 이 그리는 문안은 여기 없다. 그것은 `FacetJson.messages` 에 저작자가
 * 선언한다 (C10). `FacetJson` 은 장차 에디터로 불특정 다수가 만드는 선언이므로
 * 시각화가 무엇이라 말하는지도 저작 결정이며, 문안이 코드에 있으면 — 코드 안
 * 카탈로그라 해도 — 저작자가 손댈 수 없다.
 *
 * 이 카탈로그가 담는 것은 프레임워크가 제공하는 빌트인 view 의 기본 문구뿐이다
 * (control-bar 의 재생 버튼, code-view 의 언어 추가 등). 저작자가 매번 쓸 것이
 * 아니므로 프레임워크가 10개 언어를 책임지고, 필요하면 저작자가
 * `FacetJson.messages` 에 같은 키를 써서 덮는다.
 *
 * ── 조회 순서
 *
 *   1. FacetJson.messages[key]   저작자가 정한 문안       ← 언제나 이김
 *   2. locale 번들[key]           registerMessages 로 주입
 *   3. 코드의 en 원본             호출부 fallback
 *
 * 셋째가 반드시 있으므로 번역이 하나도 등록되지 않고 저작자가 아무것도 쓰지
 * 않아도 화면은 en 으로 온전히 동작한다.
 *
 * ── 키 규약
 *
 *   view.<viewName>.<name>    프레임워크 빌트인 view. 여기서 다루는 것.
 *   caption.push / label.top  facet 고유. FacetJson.messages 에만 있다.
 *
 * ── 사용
 *
 * View 와 Projector 는 러너가 주입한 조회기를 쓴다. 스스로 makeTranslator 를
 * 부르면 저작자 오버라이드를 보지 못한다 (C10 MUST NOT).
 *
 *   const tr = params.t ?? makeTranslator(params.locale);   // View
 *   const tr = runtime?.t ?? makeTranslator();              // Projector
 *   tr('view.controlBar.play', '▶ Play')
 */

import { resolveLocale, type LocaleStr } from '../types/locale.js';

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
 * 세 계층을 순서대로 본다.
 *   1. overrides — FacetJson.messages. 저작자가 정한 문안이라 언제나 이긴다.
 *   2. locale 번들 — registerMessages 로 주입된 번역.
 *   3. fallback — 코드에 남은 en 원본.
 *
 * 셋 다 없을 수 없다 (fallback 은 호출부가 반드시 준다). 즉 번역이 하나도
 * 등록되지 않고 저작자가 아무것도 쓰지 않아도 화면은 en 으로 온전히 동작한다.
 */
export function makeTranslator(
  locale?: string,
  overrides?: Record<string, LocaleStr>,
): Translate {
  const bundle = locale && locale !== SOURCE_LOCALE ? bundles.get(locale) : undefined;
  return (key, fallback, vars) => {
    const authored = overrides?.[key];
    const text =
      (authored !== undefined ? resolveLocale(authored, locale) : undefined) ||
      bundle?.[key] ||
      fallback;
    return interpolate(text, vars);
  };
}
