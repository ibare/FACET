/**
 * facet 카탈로그 ↔ loader 정합성.
 *
 * getFacetCatalog() 는 빌드타임 codegen(pnpm catalog:gen) 산출물이다. 여기서는
 * 발행 표면이 약속한 모양 — 언어마다 같은 facet 집합, 대체 언어, 분야 참조 — 을
 * 본다. 생성물이 원본과 한 글자라도 어긋나는지는 루트의 `test/catalog-fresh.test.ts`
 * 가 본다.
 */

import { describe, it, expect } from 'vitest';
import { listFacetLoaderIds } from '@ffacet/core/runtime';
import { bootstrapFacet, getFacetCatalog } from '../src/index.js';
import { CATALOG_LOADERS } from '../src/catalog/loaders.generated.js';

bootstrapFacet();

const loaderIds = listFacetLoaderIds().sort();
const locales = Object.keys(CATALOG_LOADERS);

describe('facet 카탈로그', () => {
  it('언어 열 개를 싣는다 — 비면 아래가 헛통과한다', () => {
    expect(locales.length).toBe(10);
    expect(locales).toContain('en');
  });

  it.each(locales)('%s 카탈로그의 id 집합이 등록된 loader id 집합과 정확히 일치한다', async (locale) => {
    const catalog = await getFacetCatalog(locale);
    expect(catalog.locale).toBe(locale);
    const ids = catalog.facets.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(loaderIds);
  });

  it.each(locales)('%s 카탈로그의 항목은 제목을 갖고 실재하는 분야 · 하위 분야를 가리킨다', async (locale) => {
    const catalog = await getFacetCatalog(locale);
    const places = new Set(catalog.domains.flatMap((d) => d.subdomains.map((s) => `${d.id}/${s.id}`)));
    const broken = catalog.facets
      .filter((e) => e.title === '' || !places.has(`${e.domain}/${e.subdomain}`))
      .map((e) => e.id);
    expect(broken).toEqual([]);
    const names = catalog.domains.flatMap((d) => [d.name, ...d.subdomains.map((s) => s.name)]);
    expect(names.filter((n) => n === '')).toEqual([]);
  });

  it('없는 언어를 달라고 하면 영어가 오고, locale 이 그 사실을 밝힌다', async () => {
    const catalog = await getFacetCatalog('xx');
    expect(catalog.locale).toBe('en');
    expect(catalog.facets.length).toBe(loaderIds.length);
  });

  it('언어를 주지 않으면 영어다', async () => {
    expect((await getFacetCatalog()).locale).toBe('en');
  });
});
