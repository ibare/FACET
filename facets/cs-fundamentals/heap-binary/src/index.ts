/**
 * @ffacet/algorithm-heap-binary — 이진 힙 완결형 번들.
 *
 * 조각이 아니다. 학습자가 자기 값을 넣고 빼며 몰아 보는 물건이라 입력 위젯 ·
 * 누적 메트릭 · 코드 패널을 갖는다.
 */

export { heapBinary, type HeapBinaryData } from './algorithm.js';
export { heapBinaryProjector } from './projector.js';
export { heapBinaryIRs, heapSiftIR } from './irs.js';
export { heapBinaryFacet } from './facet.js';
export { heapBinaryDescription } from './description.js';
export { heapBinaryStageView, type HeapBinaryStage } from './heap-binary-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { heapBinary, type HeapBinaryData } from './algorithm.js';
import { heapBinaryProjector } from './projector.js';
import { heapBinaryIRs } from './irs.js';
import { heapBinaryFacet } from './facet.js';
import { heapBinaryDescription } from './description.js';
import { heapBinaryStageView } from './heap-binary-stage.js';

export function registerHeapBinary(): void {
  registerAlgorithm<HeapBinaryData>('heapBinary', heapBinary, {
    mechanismKind: 'reactive',
  });
  registerProjector('heapBinaryProjector', heapBinaryProjector);
  for (const ir of heapBinaryIRs) registerIR(ir.id, ir);
  registerView('heap-binary-stage', heapBinaryStageView);
  registerFacets([heapBinaryFacet]);
  registerDescription(heapBinaryFacet.id, heapBinaryDescription);
}
