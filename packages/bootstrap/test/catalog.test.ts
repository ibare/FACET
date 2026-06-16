/**
 * facet 카탈로그 ↔ loader 정합성.
 *
 * getFacetCatalog() 는 빌드타임 codegen(pnpm catalog:gen) 산출물이다.
 * facet 을 추가/삭제하고 카탈로그를 재생성하지 않으면 loader 집합과 어긋나는데,
 * 이 테스트가 그 신선도(freshness) 를 가드한다. 실패하면 `pnpm catalog:gen` 을 실행하라.
 */

import { describe, it, expect } from 'vitest';
import { resolveLocale, listFacetLoaderIds } from '@ffacet/core/runtime';
import { bootstrapFacet, getFacetCatalog } from '../src/index.js';

bootstrapFacet();

const catalog = getFacetCatalog();
const catalogIds = catalog.map((e) => e.id).sort();
const loaderIds = listFacetLoaderIds().sort();

describe('facet 카탈로그', () => {
  it('카탈로그 id 집합이 등록된 loader id 집합과 정확히 일치한다 (불일치 시 pnpm catalog:gen 실행)', () => {
    expect(catalogIds).toEqual(loaderIds);
  });

  it('id 중복이 없다', () => {
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
  });

  it('모든 엔트리가 사람이 읽을 title 과 유효한 domain 을 가진다', () => {
    for (const e of catalog) {
      expect(resolveLocale(e.title)).not.toBe('');
      expect(e.domain).not.toBe('');
      expect(e.domain).not.toBe('unknown');
    }
  });
});
