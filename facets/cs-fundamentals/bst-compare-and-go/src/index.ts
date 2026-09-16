/**
 * @ffacet/algorithm-bst-compare-and-go — 조각(piece) facet 번들.
 *
 * "이진 탐색 트리는 한 번 비교할 때마다 어떻게 아래로 내려가는가?" 에 답하는
 * 조각이다. 다섯 걸음(비교 셋, 폴드 둘)을 자동 재생하고 정지하며, 다시 보기와
 * 스크럽 띠 외에는 조작을 받지 않는다. 화면은 장면(Scene) 방식이라 어느 걸음이든
 * 셈으로 얻는다 — 띠를 끌어 되짚어도 같은 화면이 선다.
 */

export {
  bstCompareAndGoAlgorithm,
  type BstCompareAndGoData,
  type BstCompareAndGoNode,
} from './algorithm.js';
export { bstCompareAndGoScene, type BstCompareAndGoScene } from './scene.js';
export { bstCompareAndGoIRs } from './irs.js';
export { bstCompareAndGoFacet } from './facet.js';
export { bstCompareAndGoDescription } from './description.js';
export { bstCompareAndGoStageView } from './bst-compare-and-go-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { bstCompareAndGoAlgorithm, type BstCompareAndGoData } from './algorithm.js';
import { bstCompareAndGoScene } from './scene.js';
import { bstCompareAndGoIRs } from './irs.js';
import { bstCompareAndGoFacet } from './facet.js';
import { bstCompareAndGoDescription } from './description.js';
import { bstCompareAndGoStageView } from './bst-compare-and-go-stage.js';

export function registerBstCompareAndGo(): void {
  registerAlgorithm<BstCompareAndGoData>('bstCompareAndGo', bstCompareAndGoAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('bstCompareAndGoScene', bstCompareAndGoScene);
  for (const ir of bstCompareAndGoIRs) registerIR(ir.id, ir);
  registerView('bst-compare-and-go-stage', bstCompareAndGoStageView);
  registerFacets([bstCompareAndGoFacet]);
  registerDescription(bstCompareAndGoFacet.id, bstCompareAndGoDescription);
}
