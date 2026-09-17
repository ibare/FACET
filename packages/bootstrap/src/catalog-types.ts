/**
 * Facet 카탈로그 타입.
 *
 * facet 시각화 모듈(algorithm/projector/scene/view)을 로드하지 않고도 호스트가
 * "추가 가능한 시각화 목록" 을 그릴 수 있도록 추린 경량 메타데이터.
 * 실제 값은 빌드타임 codegen(scripts/gen-facet-catalog.mts)이 만든다 —
 * 제목·설명은 각 facet 의 facet.ts, 분야는 `taxonomy/taxonomy.json` 에서 온다.
 *
 * 한 카탈로그는 **한 언어**다. 문자열은 이미 그 언어로 골라져 있어 호스트가
 * locale 을 다시 해석할 일이 없다.
 */

/** 카탈로그 항목 하나 — facet 하나. */
export type FacetCatalogEntry = {
  /** facet 식별자 (예: facet:bubbleSort). 호스트 DSL `{facet:<id>}` 의 id 와 동일. */
  id: string;
  /** 사람이 읽을 제목. FacetJson.title 에서 추출. */
  title: string;
  /** 한 줄 설명. FacetJson.description 에서 추출. */
  description?: string;
  /** 분야 id. `FacetCatalog.domains[].id` 중 하나. */
  domain: string;
  /** 하위 분야 id. 그 분야의 `subdomains[].id` 중 하나. */
  subdomain: string;
};

/** 하위 분야 이름표. */
export type FacetCatalogSubdomain = {
  id: string;
  name: string;
};

/** 분야 이름표. facet 이 하나라도 있는 하위 분야만 담는다. */
export type FacetCatalogDomain = {
  id: string;
  name: string;
  subdomains: FacetCatalogSubdomain[];
};

/**
 * 한 언어의 카탈로그.
 *
 * `domains` 와 `facets` 는 분류표 순서(분야 → 하위 분야 → facet)를 따른다.
 * 호스트가 묶어 그릴 때 그대로 순회하면 된다.
 */
export type FacetCatalog = {
  /**
   * 실제로 담긴 언어. 요청한 언어의 카탈로그가 없으면 'en' 이 온다 — 호스트가
   * 대체 여부를 알 수 있어야 그 문자열을 요청 언어의 것으로 믿지 않는다.
   */
  locale: string;
  domains: FacetCatalogDomain[];
  facets: FacetCatalogEntry[];
};
