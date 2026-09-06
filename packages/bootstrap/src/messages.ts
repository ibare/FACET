/**
 * 프레임워크 공통 문구 번들 로더.
 *
 * `messages/<locale>.json` 은 빌트인 view 의 기본 문구만 담는다 (C10 두 층 중
 * 프레임워크 쪽). facet 이 그리는 문안은 `FacetJson.messages` 에 있으므로 여기
 * 없다.
 *
 * 호스트가 자기 번역 리소스를 갖고 있으면 `registerMessages` 를 직접 불러 주입해도
 * 된다. 이 함수는 호스트가 없는 환경(playground 등)과, 리포에 든 번들을 그대로
 * 쓰려는 호스트를 위한 편의다.
 *
 * ## 왜 locale 별 정적 경로를 하나씩 나열하는가
 *
 * `import(`../../../messages/${locale}.json`)` 처럼 경로를 보간하면 rollup 이
 * 해석하지 못하고 그 구문을 **번들에 원문 그대로 남긴다**. 발행 tarball 은
 * `files: ["dist"]` 라 리포 루트의 `messages/` 가 딸려가지 않으므로, 소비자
 * 환경에서 모듈 해석에 실패해 이 함수 전체가 죽는다 (워크스페이스 소스를 직접
 * 참조하는 playground 에서는 번들러가 해석해 주어 드러나지 않는다).
 *
 * 경로가 정적 리터럴이면 rollup 이 각 JSON 을 개별 chunk 로 갈라 `dist/` 안에
 * 넣는다. 동적 import 라 쓰지 않는 언어는 여전히 내려받지 않는다.
 */

import { registerMessages, SOURCE_LOCALE } from '@ffacet/core/runtime';

type Bundle = { default: Record<string, string> };

/**
 * 리포에 번들이 들어 있는 locale. en 은 소스 원본이라 로드할 것이 없다.
 * 새 언어를 추가하면 `messages/<locale>.json` 과 이 표에 함께 넣는다.
 */
const LOADERS: Record<string, () => Promise<Bundle>> = {
  ko: () => import('../../../messages/ko.json') as Promise<Bundle>,
  ja: () => import('../../../messages/ja.json') as Promise<Bundle>,
  zh: () => import('../../../messages/zh.json') as Promise<Bundle>,
  ar: () => import('../../../messages/ar.json') as Promise<Bundle>,
  es: () => import('../../../messages/es.json') as Promise<Bundle>,
  fr: () => import('../../../messages/fr.json') as Promise<Bundle>,
  hi: () => import('../../../messages/hi.json') as Promise<Bundle>,
  id: () => import('../../../messages/id.json') as Promise<Bundle>,
  pt: () => import('../../../messages/pt.json') as Promise<Bundle>,
};

/**
 * 프레임워크 문구 번들을 등록한다.
 *
 * 등록할 것이 없으면 (en 이거나 미지원 locale) 조용히 지나간다 — 번들이 없어도
 * 화면은 코드의 en 원본으로 온전히 동작하므로 오류가 아니다.
 */
export async function loadFrameworkMessages(locale: string | undefined): Promise<void> {
  if (!locale || locale === SOURCE_LOCALE) return;
  const load = LOADERS[locale];
  if (!load) return;
  const mod = await load();
  registerMessages(locale, mod.default);
}
