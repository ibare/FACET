/**
 * @ffacet/algorithm-compare-and-swap — 비교와 교환 조각(piece) facet 번들.
 *
 * 질문 하나에 답하고 멈춘다. 짝 셋을 자동으로 견주고, 다시 보기와 띠 외에는
 * 조작을 받지 않는다.
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을
 * 등록하고, stage 가 `render` 하나로 산다 (S-scene).
 *
 * register 는 호스트 앱이 부른다. 이 모듈은 사이드 이펙트로 자동 등록하지 않는다.
 */

export { compareAndSwap, orderOf, type CompareAndSwapData, type PairOrder } from './algorithm.js';
export { compareAndSwapScene, type CompareAndSwapScene } from './scene.js';
export { compareAndSwapIRs } from './irs.js';
export { compareAndSwapFacet } from './facet.js';
export { compareAndSwapStageView } from './compare-and-swap-stage.js';

import {
  registerAlgorithm,
  registerScenePlan,
  registerIR,
  registerFacets,
  registerView,
} from '@ffacet/core/runtime';
import { compareAndSwap, type CompareAndSwapData } from './algorithm.js';
import { compareAndSwapScene } from './scene.js';
import { compareAndSwapIRs } from './irs.js';
import { compareAndSwapFacet } from './facet.js';
import { compareAndSwapStageView } from './compare-and-swap-stage.js';

export function registerCompareAndSwap(): void {
  registerAlgorithm<CompareAndSwapData>('compareAndSwap', compareAndSwap, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('compareAndSwapScene', compareAndSwapScene);
  for (const ir of compareAndSwapIRs) registerIR(ir.id, ir);
  registerView('compare-and-swap-stage', compareAndSwapStageView);
  registerFacets([compareAndSwapFacet]);
}
