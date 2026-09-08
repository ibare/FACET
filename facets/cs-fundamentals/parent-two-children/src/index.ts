/**
 * @ffacet/algorithm-parent-two-children — 이진 트리 조각(piece) facet 번들.
 *
 * 한 주장만 말하는 조각이다. 다섯 걸음을 자동 재생하고 멈추며, 다시 보기와
 * 한 걸음씩 외에는 조작을 받지 않는다.
 */

export {
  parentTwoChildren,
  type ParentTwoChildrenData,
  type BinaryTreeLink,
} from './algorithm.js';
export { parentTwoChildrenProjector } from './projector.js';
export { parentTwoChildrenIRs } from './irs.js';
export { parentTwoChildrenFacet } from './facet.js';
export { parentTwoChildrenDescription } from './description.js';
export { parentTwoChildrenStageView, type StageTree, type StageTreeLink } from './parent-two-children-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { parentTwoChildren, type ParentTwoChildrenData } from './algorithm.js';
import { parentTwoChildrenProjector } from './projector.js';
import { parentTwoChildrenIRs } from './irs.js';
import { parentTwoChildrenFacet } from './facet.js';
import { parentTwoChildrenDescription } from './description.js';
import { parentTwoChildrenStageView } from './parent-two-children-stage.js';

export function registerParentTwoChildren(): void {
  registerAlgorithm<ParentTwoChildrenData>('parentTwoChildren', parentTwoChildren, {
    mechanismKind: 'reactive',
  });
  registerProjector('parentTwoChildrenProjector', parentTwoChildrenProjector);
  for (const ir of parentTwoChildrenIRs) registerIR(ir.id, ir);
  registerView('parent-two-children-stage', parentTwoChildrenStageView);
  registerFacets([parentTwoChildrenFacet]);
  registerDescription(parentTwoChildrenFacet.id, parentTwoChildrenDescription);
}
