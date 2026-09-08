/**
 * heap-sort-extract 조각 등록 진입점. 호스트가 명시적으로 호출한다 — 이 모듈은
 * 사이드이펙트로 스스로 등록하지 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { heapSortExtractAlgorithm, type HeapSortExtractData } from './algorithm.js';
import { heapSortExtractDescription } from './description.js';
import { heapSortExtractFacet } from './facet.js';
import { heapSortExtractIRs } from './irs.js';
import { heapSortExtractProjector } from './projector.js';
import { heapSortExtractStageView } from './heap-sort-extract-stage.js';

export {
  heapSortExtractAlgorithm,
  computeHeapSortExtractResult,
  type HeapSortExtractData,
} from './algorithm.js';
export { heapSortExtractDescription } from './description.js';
export { heapSortExtractFacet } from './facet.js';
export { heapSortExtractIRs } from './irs.js';
export { heapSortExtractProjector } from './projector.js';
export { heapSortExtractStageView } from './heap-sort-extract-stage.js';

export function registerHeapSortExtract(): void {
  // computeResult 는 넘기지 않는다 — goal-preview 가 없는 facet 은 러너가 쓸 데가
  // 없다 (S-facet). 셈 자체는 export 로 남아 대조에 쓰인다.
  registerAlgorithm<HeapSortExtractData>('heapSortExtract', heapSortExtractAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('heapSortExtractProjector', heapSortExtractProjector);
  for (const ir of heapSortExtractIRs) registerIR(ir.id, ir);
  registerView('heap-sort-extract-stage', heapSortExtractStageView);
  registerFacets([heapSortExtractFacet]);
  registerDescription(heapSortExtractFacet.id, heapSortExtractDescription);
}
