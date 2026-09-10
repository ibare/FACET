/**
 * 개념 메타가 facet 전수를 덮는가.
 *
 * ── 왜 이것이 따로 필요한가
 *
 * facet 을 만들어도 개념 메타는 따라 생기지 않는다. `packages/authoring/src/
 * concepts/<id>.ts` 를 손으로 쓰고 `CONCEPT_SOURCES` 에 등록해야 하는데, 그
 * 두 걸음을 건너뛰어도 **facet 은 완전히 정상으로 돈다.** 화면이 뜨고 툴바에도
 * 오르고 검사도 전부 통과한다.
 *
 * 어긋남은 호스트에서만 드러난다. 호스트의 글 작성 파이프라인(catalog-sync)은
 * `getFacetCatalog()` 가 아니라 **`getFacetConcepts()`** 를 읽어 벡터 색인을
 * 만든다. 개념이 없는 facet 은 색인에 안 들어가고, 글을 쓸 때 후보로 제안되지
 * 않는다. 시각화가 있는데 아무도 그것을 부를 수 없는 상태가 된다.
 *
 * 0.4.0 에서 실제로 그렇게 나갔다 — facet 은 74 → 179 로 늘었는데 개념은 74 →
 * 74 그대로여서, 호스트가 업데이트 뒤 "신규 0" 으로 판정했다. 판정은 옳았다.
 * `pnpm concept:audit` 은 통과했지만 그것은 **선언된 개념끼리** 어휘가 겹치는지를
 * 볼 뿐, 그 선언이 전부인지는 묻지 않는다. 74 라는 수를 보고도 179 와 맞대지
 * 않으면 아무 일도 일어나지 않는다.
 *
 * ── 이 검사가 맞대는 두 목록
 *
 *   getFacetCatalog()   구현되어 등록된 facet 전부 (bootstrap codegen 산출물)
 *   getFacetConcepts()  개념이 가리키는 facet (canonicalFacet + aspects)
 */

import { describe, expect, it } from 'vitest';
import { bootstrapFacet, getFacetCatalog } from '@ffacet/bootstrap';
import { getFacetConcepts } from '@ffacet/authoring';

bootstrapFacet();

const catalog = getFacetCatalog();
const concepts = getFacetConcepts();

/** 개념이 가리키는 facet id — canonical 하나 + aspect 여럿. */
const pointedAt = new Set<string>();
for (const c of concepts) {
  pointedAt.add(c.canonicalFacet);
  for (const a of c.aspects ?? []) pointedAt.add(a);
}

describe('개념 메타와 facet', () => {
  it('두 목록을 실제로 세었다 — 비면 아래가 헛통과한다', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(179);
    expect(concepts.length).toBeGreaterThan(0);
  });

  /*
   * 이 검사가 이 파일의 이유다. 나머지 셋은 이미 다른 곳이 부분적으로 보고 있다.
   */
  it('등록된 facet 은 모두 어떤 개념이 가리킨다', () => {
    const orphans = catalog.filter((e) => !pointedAt.has(e.id)).map((e) => `${e.domain}/${e.id}`);
    expect({ 개념없는facet: orphans.length, 앞부분: orphans.slice(0, 15) }).toEqual({
      개념없는facet: 0,
      앞부분: [],
    });
  });

  /*
   * 반대 방향. 개념이 사라진 facet 을 가리키면 호스트가 색인에 실은 마커가 어느
   * 화면으로도 해석되지 않는다 — 발행된 글에 죽은 봉투가 박힌다.
   */
  it('개념이 가리키는 facet 은 모두 실재한다', () => {
    const ids = new Set(catalog.map((e) => e.id));
    const dangling: string[] = [];
    for (const c of concepts) {
      if (!ids.has(c.canonicalFacet)) dangling.push(`${c.id}.canonicalFacet → ${c.canonicalFacet}`);
      for (const a of c.aspects ?? []) if (!ids.has(a)) dangling.push(`${c.id}.aspects → ${a}`);
    }
    expect(dangling).toEqual([]);
  });

  /*
   * 개념의 domain 은 손으로 적고 facet 의 domain 은 디렉터리에서 나온다. 어긋나면
   * 호스트 카탈로그의 도메인 묶음이 facet 과 다른 자리를 가리킨다.
   */
  it('개념의 domain 이 canonicalFacet 의 domain 과 같다', () => {
    const domainOf = new Map(catalog.map((e) => [e.id, e.domain]));
    const mismatch: string[] = [];
    for (const c of concepts) {
      const real = domainOf.get(c.canonicalFacet);
      if (real !== undefined && real !== c.domain) {
        mismatch.push(`${c.id}: 선언 ${c.domain} ≠ 실제 ${real}`);
      }
    }
    expect(mismatch).toEqual([]);
  });
});
