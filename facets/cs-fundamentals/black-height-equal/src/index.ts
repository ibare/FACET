/**
 * @ffacet/algorithm-black-height-equal — 흑색 높이 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 경로를 자동 재생하고 멈추며, 다시 보기 단추와
 * 재생 자리를 끄는 띠 외에는 조작을 받지 않는다. 화면은 걸음마다의 장면에서
 * 만들어지므로 (`scene.ts`) 어느 걸음으로 끌어도 같은 그림이 선다.
 */

export {
  blackHeightEqual,
  type BlackHeightEqualData,
  type RBColor,
  type RBNode,
} from './algorithm.js';
export { blackHeightEqualScene, type BlackHeightEqualScene } from './scene.js';
export { blackHeightEqualIRs } from './irs.js';
export { blackHeightEqualFacet } from './facet.js';
export { blackHeightEqualDescription } from './description.js';
export { blackHeightEqualStageView } from './black-height-equal-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { blackHeightEqual, type BlackHeightEqualData } from './algorithm.js';
import { blackHeightEqualScene } from './scene.js';
import { blackHeightEqualIRs } from './irs.js';
import { blackHeightEqualFacet } from './facet.js';
import { blackHeightEqualDescription } from './description.js';
import { blackHeightEqualStageView } from './black-height-equal-stage.js';

export function registerBlackHeightEqual(): void {
  registerAlgorithm<BlackHeightEqualData>('blackHeightEqual', blackHeightEqual, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('blackHeightEqualScene', blackHeightEqualScene);
  for (const ir of blackHeightEqualIRs) registerIR(ir.id, ir);
  registerView('black-height-equal-stage', blackHeightEqualStageView);
  registerFacets([blackHeightEqualFacet]);
  registerDescription(blackHeightEqualFacet.id, blackHeightEqualDescription);
}
