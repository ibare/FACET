/**
 * 등록 진입점. 사이드 이펙트로 스스로 부르지 않는다 — 부르는 것은 호스트 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { mutuallyReachableAlgorithm } from './algorithm.js';
import { mutuallyReachableFacet } from './facet.js';
import { mutuallyReachableIRs } from './irs.js';
import { mutuallyReachableStageView } from './mutually-reachable-stage.js';
import { mutuallyReachableScene } from './scene.js';

export { mutuallyReachableAlgorithm } from './algorithm.js';
export type { MutuallyReachableData, MutuallyReachableEdge } from './algorithm.js';
export { mutuallyReachableFacet } from './facet.js';
export { mutuallyReachableIRs } from './irs.js';
export { mutuallyReachableStageView } from './mutually-reachable-stage.js';
export type { StageEdge } from './mutually-reachable-stage.js';
export { mutuallyReachableScene, type MutuallyReachableScene } from './scene.js';

export function registerMutuallyReachable(): void {
  registerAlgorithm('mutuallyReachable', mutuallyReachableAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('mutuallyReachableScene', mutuallyReachableScene);
  for (const ir of mutuallyReachableIRs) registerIR(ir.id, ir);
  registerView('mutually-reachable-stage', mutuallyReachableStageView);
  registerFacets([mutuallyReachableFacet]);
}
