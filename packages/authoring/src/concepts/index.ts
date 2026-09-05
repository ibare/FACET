/**
 * 개념 선언 집합.
 *
 * 개념이 늘어나면 이 배열에 추가한다. facet 카탈로그(@ffacet/bootstrap)와의
 * 정합 — canonicalFacet 이 실재하는 facet id 인지, domain 이 디렉터리 구조와
 * 맞는지 — 은 향후 catalog codegen 이 검사한다.
 *
 * 미선언 대비 개념 (dangling contrastWith)
 * ────────────────────────────────────────
 * briefing.contrastWith 는 아직 선언되지 않은 개념을 가리킬 수 있다. 지금
 * queue 가 참조하는 stack / array / linkedList 가 모두 그렇다 — facet 은
 * 실재하지만 (facet:stack / facet:array / facet:linkedList) 개념 선언이 아직
 * 없어서 getFacetConcept('stack') 은 undefined 다.
 *
 * 이 상태를 허용하는 이유는 대비 링크가 개념 추가 순서에 종속되면 안 되기
 * 때문이다. 먼저 쓴 개념이 나중에 올 개념을 미리 가리키는 것은 정상이며,
 * `[[name]]` 링크와 같은 성격이다. 소비자는 역참조가 undefined 일 수 있다고
 * 보고 대비 note 만 쓰면 된다 (note 자체는 자족적인 문장이다).
 *
 * TODO: 18개 개념이 모두 선언되면 여기서 contrastWith 참조 무결성 검증을
 * 켠다. 그 시점부터는 dangling 이 오타를 뜻하게 된다.
 */

import type { FacetConceptSource } from '../concept-types.js';
import { arrayConcept } from './array.js';
import { bfsConcept } from './bfs.js';
import { bstConcept } from './bst.js';
import { bubbleSortConcept } from './bubble-sort.js';
import { hashTableChainingConcept } from './hash-table-chaining.js';
import { linkedListSinglyConcept } from './linked-list-singly.js';
import { lruCacheConcept } from './lru-cache.js';
import { queueFifoConcept } from './queue.js';
import { stackConcept } from './stack.js';

export const CONCEPT_SOURCES: readonly FacetConceptSource[] = [
  queueFifoConcept,
  stackConcept,
  bfsConcept,
  bstConcept,
  bubbleSortConcept,
  arrayConcept,
  linkedListSinglyConcept,
  hashTableChainingConcept,
  lruCacheConcept,
];
