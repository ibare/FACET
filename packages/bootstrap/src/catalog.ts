/**
 * Facet 카탈로그 조회 — 시각화 모듈 미로드 접근 경로.
 *
 * bootstrapFacet() 의 registerFacetLoader 매핑과 동일한 facet 집합을 대상으로,
 * 모듈을 로드하지 않고도 id/title/description/분야를 조회한다. 호스트는 이 목록으로
 * 슬래시 메뉴 / facet 피커 등을 facet chunk 0 개 로드로 그릴 수 있다.
 *
 * ## 왜 언어마다 따로 불러오는가
 *
 * 카탈로그는 facet 마다 제목과 설명을 10개 언어로 가진다. 한 모듈에 다 담으면
 * 호스트가 한 언어만 쓰는데도 bootstrap 을 import 하는 순간 전부가 첫 번들에
 * 실린다. 언어별 모듈을 동적 import 로 두면 번들러가 각각을 chunk 로 갈라,
 * 요청한 언어 하나만 내려받는다. 경로를 정적 리터럴로 나열하는 까닭은
 * `messages.ts` 와 같다 — 보간하면 rollup 이 해석하지 못한다. 그 나열은
 * 생성기가 `catalog/loaders.generated.ts` 로 함께 만든다.
 */

import type { FacetCatalog } from './catalog-types.js';
import { CATALOG_LOADERS } from './catalog/loaders.generated.js';

/** 요청 언어의 카탈로그가 없을 때 쓰는 언어. facet 제목·설명의 원본 언어다. */
const FALLBACK_LOCALE = 'en';

/**
 * 추가 가능한 facet 시각화의 경량 카탈로그를 한 언어로 불러온다.
 * facet 모듈 로드를 유발하지 않는다.
 *
 * 지원하지 않는 언어면 영어 카탈로그가 오며, 반환값의 `locale` 이 'en' 이 된다.
 */
export async function getFacetCatalog(locale: string = FALLBACK_LOCALE): Promise<FacetCatalog> {
  const load = CATALOG_LOADERS[locale] ?? CATALOG_LOADERS[FALLBACK_LOCALE];
  if (!load) throw new Error(`카탈로그 기본 언어(${FALLBACK_LOCALE}) 모듈이 생성되지 않았다`);
  return (await load()).CATALOG;
}
