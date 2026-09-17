/**
 * @ffacet/algorithm-deque-both-ends — 양방향 큐 조각(piece) facet 번들.
 *
 * 한 주장을 말하는 조각이다. 네 조작과 마무리를 자동으로 재생하고 멈추며,
 * 다시 보기와 스크럽 띠 외에는 조작을 받지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 */

export { dequeBothEnds, type DequeBothEndsData } from './algorithm.js';
export { dequeBothEndsScene, type DequeBothEndsScene, type DequeSide } from './scene.js';
export { dequeBothEndsIRs } from './irs.js';
export { dequeBothEndsFacet } from './facet.js';
export { dequeBothEndsStageView } from './deque-both-ends-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { dequeBothEnds, type DequeBothEndsData } from './algorithm.js';
import { dequeBothEndsScene } from './scene.js';
import { dequeBothEndsIRs } from './irs.js';
import { dequeBothEndsFacet } from './facet.js';
import { dequeBothEndsStageView } from './deque-both-ends-stage.js';

export function registerDequeBothEnds(): void {
  registerAlgorithm<DequeBothEndsData>('dequeBothEnds', dequeBothEnds, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('dequeBothEndsScene', dequeBothEndsScene);
  for (const ir of dequeBothEndsIRs) registerIR(ir.id, ir);
  registerView('deque-both-ends-stage', dequeBothEndsStageView);
  registerFacets([dequeBothEndsFacet]);
}
