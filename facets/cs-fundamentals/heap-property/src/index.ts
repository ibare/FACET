/**
 * @ffacet/algorithm-heap-property — 힙 성질 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 자동 재생으로 부모-자식 짝 여섯을 짚고 형제
 * 짝은 견주지 않음을 보인 뒤 정지하며, 다시 보기와 한 걸음씩 짚기 외에는
 * 조작을 받지 않는다.
 */

export { heapPropertyAlgorithm, type HeapPropertyData, type HeapNode } from './algorithm.js';
export { heapPropertyProjector } from './projector.js';
export { heapPropertyIRs } from './irs.js';
export { heapPropertyFacet } from './facet.js';
export { heapPropertyDescription } from './description.js';
export { heapPropertyStageView } from './heap-property-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { heapPropertyAlgorithm, type HeapPropertyData } from './algorithm.js';
import { heapPropertyProjector } from './projector.js';
import { heapPropertyIRs } from './irs.js';
import { heapPropertyFacet } from './facet.js';
import { heapPropertyDescription } from './description.js';
import { heapPropertyStageView } from './heap-property-stage.js';

export function registerHeapProperty(): void {
  registerAlgorithm<HeapPropertyData>('heapProperty', heapPropertyAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('heapPropertyProjector', heapPropertyProjector);
  for (const ir of heapPropertyIRs) registerIR(ir.id, ir);
  registerView('heap-property-stage', heapPropertyStageView);
  registerFacets([heapPropertyFacet]);
  registerDescription(heapPropertyFacet.id, heapPropertyDescription);
}
