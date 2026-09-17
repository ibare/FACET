/**
 * @ffacet/algorithm-bst-inorder-sorted — 중위 순회는 정렬되어 나온다, 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 각 마디마다 서기·내놓기를 자동 재생하고 정지하며,
 * 다시 보기 단추와 재생 자리를 끄는 띠 외에는 조작을 받지 않는다. 화면은 걸음마다의
 * 장면에서 만들어지므로 (`scene.ts`) 어느 걸음으로 끌어도 같은 그림이 선다.
 */

export {
  bstInorderSortedAlgorithm,
  type BstInorderSortedData,
  type BstInorderSortedNode,
} from './algorithm.js';
export { bstInorderSortedScene, type BstInorderSortedScene } from './scene.js';
export { bstInorderSortedIRs } from './irs.js';
export { bstInorderSortedFacet } from './facet.js';
export { bstInorderSortedStageView } from './bst-inorder-sorted-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { bstInorderSortedAlgorithm, type BstInorderSortedData } from './algorithm.js';
import { bstInorderSortedScene } from './scene.js';
import { bstInorderSortedIRs } from './irs.js';
import { bstInorderSortedFacet } from './facet.js';
import { bstInorderSortedStageView } from './bst-inorder-sorted-stage.js';

export function registerBstInorderSorted(): void {
  registerAlgorithm<BstInorderSortedData>('bstInorderSorted', bstInorderSortedAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('bstInorderSortedScene', bstInorderSortedScene);
  for (const ir of bstInorderSortedIRs) registerIR(ir.id, ir);
  registerView('bst-inorder-sorted-stage', bstInorderSortedStageView);
  registerFacets([bstInorderSortedFacet]);
}
