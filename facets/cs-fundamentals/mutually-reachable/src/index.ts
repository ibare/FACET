/**
 * 등록 진입점. 사이드 이펙트로 스스로 부르지 않는다 — 부르는 것은 호스트 몫이다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { mutuallyReachableAlgorithm } from './algorithm.js';
import { mutuallyReachableDescription } from './description.js';
import { mutuallyReachableFacet } from './facet.js';
import { mutuallyReachableIRs } from './irs.js';
import { mutuallyReachableStageView } from './mutually-reachable-stage.js';
import { mutuallyReachableProjector } from './projector.js';

export { mutuallyReachableAlgorithm } from './algorithm.js';
export type { MutuallyReachableData, MutuallyReachableEdge } from './algorithm.js';
export { mutuallyReachableDescription } from './description.js';
export { mutuallyReachableFacet } from './facet.js';
export { mutuallyReachableIRs } from './irs.js';
export { mutuallyReachableStageView } from './mutually-reachable-stage.js';
export type { MutuallyReachableStageInstance, StageEdge } from './mutually-reachable-stage.js';
export { mutuallyReachableProjector } from './projector.js';

export function registerMutuallyReachable(): void {
  registerAlgorithm('mutuallyReachable', mutuallyReachableAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('mutuallyReachableProjector', mutuallyReachableProjector);
  for (const ir of mutuallyReachableIRs) registerIR(ir.id, ir);
  registerView('mutually-reachable-stage', mutuallyReachableStageView);
  registerFacets([mutuallyReachableFacet]);
  registerDescription(mutuallyReachableFacet.id, mutuallyReachableDescription);
}
