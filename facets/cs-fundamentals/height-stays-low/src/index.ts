/**
 * @ffacet/algorithm-height-stays-low — 낮은 트리 높이 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 두 나무가 같은 목표 잎 수를 각자 덮어 나가는
 * 걸음을 자동 재생하고 정지하며, 다시 보기와 스크럽 띠 외에는 조작을 받지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 */

export {
  heightStaysLow,
  type HeightStaysLowData,
} from './algorithm.js';
export {
  heightStaysLowScene,
  type HeightStaysLowScene,
  type LadderScene,
  type TreeId,
} from './scene.js';
export { heightStaysLowIRs } from './irs.js';
export { heightStaysLowFacet } from './facet.js';
export { heightStaysLowDescription } from './description.js';
export { heightStaysLowStageView } from './height-stays-low-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@ffacet/core/runtime';
import { heightStaysLow, type HeightStaysLowData } from './algorithm.js';
import { heightStaysLowScene } from './scene.js';
import { heightStaysLowIRs } from './irs.js';
import { heightStaysLowFacet } from './facet.js';
import { heightStaysLowDescription } from './description.js';
import { heightStaysLowStageView } from './height-stays-low-stage.js';

export function registerHeightStaysLow(): void {
  registerAlgorithm<HeightStaysLowData>('heightStaysLow', heightStaysLow, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('heightStaysLowScene', heightStaysLowScene);
  for (const ir of heightStaysLowIRs) registerIR(ir.id, ir);
  registerView('height-stays-low-stage', heightStaysLowStageView);
  registerFacets([heightStaysLowFacet]);
  registerDescription(heightStaysLowFacet.id, heightStaysLowDescription);
}
