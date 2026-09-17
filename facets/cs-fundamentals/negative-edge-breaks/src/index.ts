/**
 * negativeEdgeBreaks 조각의 등록 진입점.
 *
 * 걸음들을 자동으로 재생하고 멈춘다. 그 뒤 스크럽 띠로 어느 걸음이든 끌어 볼 수
 * 있다 — 화면을 명령이 아니라 장면으로 만들므로 되짚기가 앞으로 가기와 같은 연산이다.
 *
 * 사이드 이펙트로 스스로 등록하지 않는다 — 부르는 것은 호스트 앱의 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { negativeEdgeBreaksAlgorithm } from './algorithm.js';
import { negativeEdgeBreaksFacet } from './facet.js';
import { negativeEdgeBreaksIRs } from './irs.js';
import { negativeEdgeBreaksScene } from './scene.js';
import { negativeEdgeBreaksStageView } from './negative-edge-breaks-stage.js';

export { negativeEdgeBreaksAlgorithm } from './algorithm.js';
export type { NegativeEdge, NegativeEdgeBreaksData } from './algorithm.js';
export { negativeEdgeBreaksFacet } from './facet.js';
export { negativeEdgeBreaksIRs } from './irs.js';
export {
  negativeEdgeBreaksScene,
  candidateOf,
  distOf,
  isSealed,
  lastBlock,
  lastKeep,
  lastRefusal,
  refusedAt,
  truthMismatches,
  truthRunning,
  truthTotal,
  weightOf,
} from './scene.js';
export type {
  NegativeBlock,
  NegativeEdgeBreaksCaption,
  NegativeEdgeBreaksScene,
  NegativeEdgeBreaksStep,
  NegativeEdgeLink,
  NegativeKeep,
  NegativeRefusal,
} from './scene.js';
export { negativeEdgeBreaksStageView } from './negative-edge-breaks-stage.js';

export function registerNegativeEdgeBreaks(): void {
  registerAlgorithm('negativeEdgeBreaks', negativeEdgeBreaksAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('negativeEdgeBreaksScene', negativeEdgeBreaksScene);
  for (const ir of negativeEdgeBreaksIRs) registerIR(ir.id, ir);
  registerView('negative-edge-breaks-stage', negativeEdgeBreaksStageView);
  registerFacets([negativeEdgeBreaksFacet]);
}
