/**
 * @ffacet/algorithm-parent-two-children — 이진 트리 조각(piece) facet 번들.
 *
 * 한 주장만 말하는 조각이다. 다섯 걸음을 자동 재생하고 멈추며, 다시 보기와
 * 스크럽 띠 외에는 조작을 받지 않는다.
 */

export {
  parentTwoChildren,
  type ParentTwoChildrenData,
  type BinaryTreeLink,
} from './algorithm.js';
export {
  parentTwoChildrenScene,
  type ParentTwoChildrenScene,
  type ParentTwoChildrenLink,
  type ParentTwoChildrenSplit,
  type ParentTwoChildrenCaption,
  type ParentTwoChildrenStep,
} from './scene.js';
export { parentTwoChildrenIRs } from './irs.js';
export { parentTwoChildrenFacet } from './facet.js';
export { parentTwoChildrenDescription } from './description.js';
export { parentTwoChildrenStageView } from './parent-two-children-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { parentTwoChildren, type ParentTwoChildrenData } from './algorithm.js';
import { parentTwoChildrenScene } from './scene.js';
import { parentTwoChildrenIRs } from './irs.js';
import { parentTwoChildrenFacet } from './facet.js';
import { parentTwoChildrenDescription } from './description.js';
import { parentTwoChildrenStageView } from './parent-two-children-stage.js';

export function registerParentTwoChildren(): void {
  registerAlgorithm<ParentTwoChildrenData>('parentTwoChildren', parentTwoChildren, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('parentTwoChildrenScene', parentTwoChildrenScene);
  for (const ir of parentTwoChildrenIRs) registerIR(ir.id, ir);
  registerView('parent-two-children-stage', parentTwoChildrenStageView);
  registerFacets([parentTwoChildrenFacet]);
  registerDescription(parentTwoChildrenFacet.id, parentTwoChildrenDescription);
}
