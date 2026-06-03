/**
 * Facet 카탈로그 엔트리 타입.
 *
 * facet 시각화 모듈(algorithm/projector/IR/view)을 로드하지 않고도 호스트가
 * "추가 가능한 시각화 목록" 을 그릴 수 있도록 추린 경량 메타데이터.
 * 실제 값은 빌드타임 codegen(scripts/gen-facet-catalog.mts)이 각 facet 의
 * 런타임 등록 결과에서 추출해 facet-catalog.generated.ts 로 emit 한다.
 */

import type { LocaleStr } from '@facet/core/runtime';

export type FacetCatalogEntry = {
  /** facet 식별자 (예: facet:bubbleSort). 호스트 DSL `{facet:<id>}` 의 id 와 동일. */
  id: string;
  /** 사람이 읽을 제목 (locale 분기). FacetJson.title 에서 추출. */
  title: LocaleStr;
  /** 한 줄 설명 (locale 분기). FacetJson.description 에서 추출. */
  description?: LocaleStr;
  /** facet 이 속한 도메인 그룹 (예: cs-fundamentals, network). 디렉터리 구조에서 추출. */
  domain: string;
};
