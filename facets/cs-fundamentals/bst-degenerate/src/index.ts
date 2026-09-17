/**
 * @ffacet/algorithm-bst-degenerate — 편향 트리 조각(piece) facet 번들.
 *
 * 한 주장만 말하는 조각이다. 두 나무를 함께 기르고 찾아본 뒤 멈추고,
 * 다시 보기와 한 걸음씩 외에는 조작을 받지 않는다.
 */

export { bstDegenerate, type BstDegenerateData } from './algorithm.js';
export { bstDegenerateScene } from './scene.js';
export { bstDegenerateIRs } from './irs.js';
export { bstDegenerateFacet } from './facet.js';
export { bstDegenerateStageView } from './bst-degenerate-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { bstDegenerate, type BstDegenerateData } from './algorithm.js';
import { bstDegenerateScene } from './scene.js';
import { bstDegenerateIRs } from './irs.js';
import { bstDegenerateFacet } from './facet.js';
import { bstDegenerateStageView } from './bst-degenerate-stage.js';

export function registerBstDegenerate(): void {
  registerAlgorithm<BstDegenerateData>('bstDegenerate', bstDegenerate, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('bstDegenerateScene', bstDegenerateScene);
  for (const ir of bstDegenerateIRs) registerIR(ir.id, ir);
  registerView('bst-degenerate-stage', bstDegenerateStageView);
  registerFacets([bstDegenerateFacet]);
}
