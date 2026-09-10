/**
 * mergeNearestPair 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { mergeNearestPairAlgorithm, type MergeNearestPairData } from './algorithm.js';
import { mergeNearestPairDescription } from './description.js';
import { mergeNearestPairFacet } from './facet.js';
import { mergeNearestPairIRs } from './irs.js';
import { mergeNearestPairStageView } from './merge-nearest-pair-stage.js';
import { mergeNearestPairProjector } from './projector.js';

export { mergeNearestPairAlgorithm } from './algorithm.js';
export type { MergeNearestPairData, MergePoint } from './algorithm.js';
export { mergeNearestPairProjector } from './projector.js';
export { mergeNearestPairIRs } from './irs.js';
export { mergeNearestPairFacet } from './facet.js';
export { mergeNearestPairDescription } from './description.js';
export { mergeNearestPairStageView, readMergeScene } from './merge-nearest-pair-stage.js';
export type { MergeScene, MergeScenePoint, StageMerge } from './merge-nearest-pair-stage.js';

export function registerMergeNearestPair(): void {
  registerAlgorithm<MergeNearestPairData>('mergeNearestPair', mergeNearestPairAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerProjector('mergeNearestPairProjector', mergeNearestPairProjector);
  for (const ir of mergeNearestPairIRs) registerIR(ir.id, ir);
  registerView('merge-nearest-pair-stage', mergeNearestPairStageView);
  registerFacets([mergeNearestPairFacet]);
  registerDescription(mergeNearestPairFacet.id, mergeNearestPairDescription);
}
