/**
 * @ffacet/algorithm-heap-property — 힙 성질 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 자동 재생으로 부모-자식 짝 여섯을 짚고 형제
 * 짝은 견주지 않음을 보인 뒤 정지하며, 다시 보기와 스크럽 띠 외에는 조작을
 * 받지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 */

export { heapPropertyAlgorithm, type HeapPropertyData, type HeapNode } from './algorithm.js';
export {
  heapPropertyScene,
  type HeapPropertyScene,
  type CheckedPair,
  type SkippedPair,
} from './scene.js';
export { heapPropertyIRs } from './irs.js';
export { heapPropertyFacet } from './facet.js';
export { heapPropertyDescription } from './description.js';
export { heapPropertyStageView } from './heap-property-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { heapPropertyAlgorithm, type HeapPropertyData } from './algorithm.js';
import { heapPropertyScene } from './scene.js';
import { heapPropertyIRs } from './irs.js';
import { heapPropertyFacet } from './facet.js';
import { heapPropertyDescription } from './description.js';
import { heapPropertyStageView } from './heap-property-stage.js';

export function registerHeapProperty(): void {
  registerAlgorithm<HeapPropertyData>('heapProperty', heapPropertyAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('heapPropertyScene', heapPropertyScene);
  for (const ir of heapPropertyIRs) registerIR(ir.id, ir);
  registerView('heap-property-stage', heapPropertyStageView);
  registerFacets([heapPropertyFacet]);
  registerDescription(heapPropertyFacet.id, heapPropertyDescription);
}
