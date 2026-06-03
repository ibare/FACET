/**
 * Facet 카탈로그 조회 — 시각화 모듈 미로드 접근 경로.
 *
 * bootstrapFacet() 의 registerFacetLoader 매핑과 동일한 facet 집합을 대상으로,
 * 모듈을 로드하지 않고도 id/title/description/domain 을 동기 조회한다.
 * 호스트는 이 목록으로 슬래시 메뉴 / facet 피커 등을 chunk 0 개 로드로 그릴 수 있다.
 */

import type { FacetCatalogEntry } from './catalog-types.js';
import { FACET_CATALOG } from './facet-catalog.generated.js';

/** 추가 가능한 facet 시각화의 경량 카탈로그. 모듈 로드를 유발하지 않는다. */
export function getFacetCatalog(): readonly FacetCatalogEntry[] {
  return FACET_CATALOG;
}
