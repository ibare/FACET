/**
 * suffix-array facet 등록 진입점.
 *
 * 등록을 사이드 이펙트로 하지 않는다 — 부르는 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { suffixArrayAlgorithm, type SuffixArrayData } from './algorithm.js';
import { suffixArrayProjector } from './projector.js';
import { suffixArrayIRs } from './irs.js';
import { suffixArrayStageView } from './suffix-array-stage.js';
import { suffixArrayFacet } from './facet.js';
import { suffixArrayDescription } from './description.js';

export {
  suffixArrayAlgorithm,
  buildTails,
  suffixLess,
  sortSuffixes,
  suffixArrayOf,
  overlapOf,
  neighborOverlaps,
  overlapSumOf,
  overlapAverageOf,
  prefixCompare,
  findBlock,
  computeSuffixArrayResult,
} from './algorithm.js';
export type {
  SuffixArrayData,
  SuffixArrayText,
  SuffixSortResult,
  Tail,
  ProbeStep,
  BlockResult,
} from './algorithm.js';
export { suffixArrayProjector } from './projector.js';
export { suffixArrayIRs, suffixArrayImperativeIR } from './irs.js';
export { suffixArrayStageView } from './suffix-array-stage.js';
export { suffixArrayFacet } from './facet.js';
export { suffixArrayDescription } from './description.js';

export function registerSuffixArray(): void {
  // 손잡이가 있는 완제품이라 reactive 다. 세 상태 — 나아가는 중 · 멈춤 ·
  // 입력 대기 — 는 ReactiveMechanism 이 진다.
  registerAlgorithm<SuffixArrayData>('suffixArray', suffixArrayAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('suffixArrayProjector', suffixArrayProjector);
  for (const ir of suffixArrayIRs) registerIR(ir.id, ir);
  registerView('suffix-array-stage', suffixArrayStageView);
  registerFacets([suffixArrayFacet]);
  registerDescription(suffixArrayFacet.id, suffixArrayDescription);
}
