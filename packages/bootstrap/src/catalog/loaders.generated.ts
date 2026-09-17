/**
 * 자동 생성 파일 — 직접 편집하지 말 것.
 *
 * 생성: pnpm catalog:gen  (scripts/gen-facet-catalog.mts)
 * 출처: 각 facet 의 facet.ts(title/description) + taxonomy/taxonomy.json(분야).
 */

import type { FacetCatalog } from '../catalog-types.js';

/** 언어 → 그 언어 카탈로그 모듈. 경로가 정적 리터럴이어야 번들러가 chunk 로 가른다. */
export const CATALOG_LOADERS: Record<string, () => Promise<{ CATALOG: FacetCatalog }>> = {
  "en": () => import('./en.generated.js'),
  "ar": () => import('./ar.generated.js'),
  "es": () => import('./es.generated.js'),
  "fr": () => import('./fr.generated.js'),
  "hi": () => import('./hi.generated.js'),
  "id": () => import('./id.generated.js'),
  "ja": () => import('./ja.generated.js'),
  "ko": () => import('./ko.generated.js'),
  "pt": () => import('./pt.generated.js'),
  "zh": () => import('./zh.generated.js'),
};
