/**
 * @ffacet/algorithm-sift-up — 상향 재배치 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 걸음을 자동 재생하고 정지하며, 다시 보기 단추와
 * 재생 자리를 끄는 띠 외에는 조작을 받지 않는다. 화면은 걸음마다의 장면에서
 * 만들어지므로 (`scene.ts`) 어느 걸음으로 끌어도 같은 그림이 선다.
 */

export { siftUpAlgorithm, type SiftUpData } from './algorithm.js';
export { siftUpScene, type SiftUpScene } from './scene.js';
export { siftUpIRs } from './irs.js';
export { siftUpFacet } from './facet.js';
export { siftUpDescription } from './description.js';
export { siftUpStageView } from './sift-up-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { siftUpAlgorithm, type SiftUpData } from './algorithm.js';
import { siftUpScene } from './scene.js';
import { siftUpIRs } from './irs.js';
import { siftUpFacet } from './facet.js';
import { siftUpDescription } from './description.js';
import { siftUpStageView } from './sift-up-stage.js';

export function registerSiftUp(): void {
  registerAlgorithm<SiftUpData>('siftUp', siftUpAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('siftUpScene', siftUpScene);
  for (const ir of siftUpIRs) registerIR(ir.id, ir);
  registerView('sift-up-stage', siftUpStageView);
  registerFacets([siftUpFacet]);
  registerDescription(siftUpFacet.id, siftUpDescription);
}
