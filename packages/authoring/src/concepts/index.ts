/**
 * 개념 선언 집합.
 *
 * 개념이 늘어나면 이 배열에 추가한다. facet 카탈로그(@ffacet/bootstrap)와의
 * 정합 — canonicalFacet 이 실재하는 facet id 인지, domain 이 디렉터리 구조와
 * 맞는지 — 은 향후 catalog codegen 이 검사한다.
 *
 * contrastWith 참조 무결성
 * ────────────────────────────
 * 19종이 모두 선언되었으므로 index.ts 의 materialize 가 contrastWith 참조를
 * 검증한다. 이제 미선언 id 는 오타를 뜻한다 — 실제로 facet 개명 뒤 queue 가
 * 옛 id(linkedList)를 가리키고 있던 것이 이 검증으로 드러났다.
 */

import type { FacetConceptSource } from '../concept-types.js';
import { arrayConcept } from './array.js';
import { asymmetricRsaConcept } from './asymmetric-rsa.js';
import { bfsConcept } from './bfs.js';
import { bstConcept } from './bst.js';
import { bubbleSortConcept } from './bubble-sort.js';
import { cachingCdnConcept } from './caching-cdn.js';
import { conditionalStatementConcept } from './conditional-statement.js';
import { contextSwitchingConcept } from './context-switching.js';
import { hashAvalancheConcept } from './hash-avalanche.js';
import { hashChainConcept } from './hash-chain.js';
import { hashIntegrityCheckConcept } from './hash-integrity-check.js';
import { hashSaltConcept } from './hash-salt.js';
import { hashFixedLengthConcept } from './hash-fixed-length.js';
import { hashTableChainingConcept } from './hash-table-chaining.js';
import { pigeonholeCollisionConcept } from './pigeonhole-collision.js';
import { ipRoutingConcept } from './ip-routing.js';
import { linearRegressionConcept } from './linear-regression.js';
import { linkedListSinglyConcept } from './linked-list-singly.js';
import { merkleTreeConcept } from './merkle-tree.js';
import { lruCacheConcept } from './lru-cache.js';
import { matrixTransform2dConcept } from './matrix-transform-2d.js';
import { messagingPubsubConcept } from './messaging-pubsub.js';
import { relationalTablesAndKeysConcept } from './relational-tables-and-keys.js';
import { tokenizationConcept } from './tokenization.js';
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
  hashAvalancheConcept,
  hashChainConcept,
  hashIntegrityCheckConcept,
  hashSaltConcept,
  merkleTreeConcept,
  hashFixedLengthConcept,
  hashTableChainingConcept,
  pigeonholeCollisionConcept,
  lruCacheConcept,
  tokenizationConcept,
  relationalTablesAndKeysConcept,
  matrixTransform2dConcept,
  linearRegressionConcept,
  ipRoutingConcept,
  contextSwitchingConcept,
  conditionalStatementConcept,
  asymmetricRsaConcept,
  cachingCdnConcept,
  messagingPubsubConcept,
];
