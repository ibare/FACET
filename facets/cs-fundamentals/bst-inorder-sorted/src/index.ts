/**
 * @ffacet/algorithm-bst-inorder-sorted — 중위 순회는 정렬되어 나온다, 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 아홉 걸음(각 노드마다 서기·내놓기)을 자동
 * 재생하고 정지하며, 다시 보기 · 한 걸음 두 컨트롤 외에는 조작을 받지 않는다.
 */

export {
  bstInorderSortedAlgorithm,
  type BstInorderSortedData,
  type BstInorderSortedNode,
} from './algorithm.js';
export { bstInorderSortedProjector } from './projector.js';
export { bstInorderSortedIRs } from './irs.js';
export { bstInorderSortedFacet } from './facet.js';
export { bstInorderSortedDescription } from './description.js';
export { bstInorderSortedStageView } from './bst-inorder-sorted-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { bstInorderSortedAlgorithm, type BstInorderSortedData } from './algorithm.js';
import { bstInorderSortedProjector } from './projector.js';
import { bstInorderSortedIRs } from './irs.js';
import { bstInorderSortedFacet } from './facet.js';
import { bstInorderSortedDescription } from './description.js';
import { bstInorderSortedStageView } from './bst-inorder-sorted-stage.js';

export function registerBstInorderSorted(): void {
  registerAlgorithm<BstInorderSortedData>('bstInorderSorted', bstInorderSortedAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('bstInorderSortedProjector', bstInorderSortedProjector);
  for (const ir of bstInorderSortedIRs) registerIR(ir.id, ir);
  registerView('bst-inorder-sorted-stage', bstInorderSortedStageView);
  registerFacets([bstInorderSortedFacet]);
  registerDescription(bstInorderSortedFacet.id, bstInorderSortedDescription);
}
