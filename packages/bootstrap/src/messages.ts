/**
 * 프레임워크 공통 문구 번들 로더.
 *
 * `messages/<locale>.json` 은 빌트인 view 의 기본 문구만 담는다 (C10 두 층 중
 * 프레임워크 쪽). facet 이 그리는 문안은 `FacetJson.messages` 에 있으므로 여기
 * 없다.
 *
 * 호스트가 자기 번역 리소스를 갖고 있으면 `registerMessages` 를 직접 불러 주입해도
 * 된다. 이 함수는 호스트가 없는 환경(playground 등)과, 리포에 든 en/ko 를 그대로
 * 쓰려는 호스트를 위한 편의다.
 *
 * locale 별 동적 import 라 쓰지 않는 언어는 번들에 딸려오지 않는다.
 */

import { registerMessages, SOURCE_LOCALE } from '@ffacet/core/runtime';

/** 리포에 번들이 들어 있는 locale. en 은 소스 원본이라 로드할 것이 없다. */
const AVAILABLE = new Set(['ko']);

/**
 * 프레임워크 문구 번들을 등록한다.
 *
 * 등록할 것이 없으면 (en 이거나 미지원 locale) 조용히 지나간다 — 번들이 없어도
 * 화면은 코드의 en 원본으로 온전히 동작하므로 오류가 아니다.
 */
export async function loadFrameworkMessages(locale: string | undefined): Promise<void> {
  if (!locale || locale === SOURCE_LOCALE || !AVAILABLE.has(locale)) return;
  const mod = (await import(`../../../messages/${locale}.json`)) as {
    default: Record<string, string>;
  };
  registerMessages(locale, mod.default);
}
