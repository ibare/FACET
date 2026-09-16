/**
 * @ffacet/algorithm-recolor-then-rotate — 재색칠과 회전 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 20, 10, 30, 5, 3 을 자동 재생으로 넣고 정지하며,
 * 다시 보기 단추와 재생 자리를 끄는 띠 외에는 조작을 받지 않는다. 화면은 걸음마다의
 * 장면에서 만들어지므로 (`scene.ts`) 어느 걸음으로 끌어도 같은 그림이 선다.
 */

export {
  recolorThenRotate,
  type RecolorThenRotateData,
} from './algorithm.js';
export { recolorThenRotateScene, type RecolorThenRotateScene } from './scene.js';
export { recolorThenRotateIRs } from './irs.js';
export { recolorThenRotateFacet } from './facet.js';
export { recolorThenRotateDescription } from './description.js';
export { recolorThenRotateStageView } from './recolor-then-rotate-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { recolorThenRotate, type RecolorThenRotateData } from './algorithm.js';
import { recolorThenRotateScene } from './scene.js';
import { recolorThenRotateIRs } from './irs.js';
import { recolorThenRotateFacet } from './facet.js';
import { recolorThenRotateDescription } from './description.js';
import { recolorThenRotateStageView } from './recolor-then-rotate-stage.js';

export function registerRecolorThenRotate(): void {
  registerAlgorithm<RecolorThenRotateData>('recolorThenRotate', recolorThenRotate, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('recolorThenRotateScene', recolorThenRotateScene);
  for (const ir of recolorThenRotateIRs) registerIR(ir.id, ir);
  registerView('recolor-then-rotate-stage', recolorThenRotateStageView);
  registerFacets([recolorThenRotateFacet]);
  registerDescription(recolorThenRotateFacet.id, recolorThenRotateDescription);
}
