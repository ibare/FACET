/**
 * mergeNearestPair 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { mergeNearestPairAlgorithm, type MergeNearestPairData } from './algorithm.js';
import { mergeNearestPairFacet } from './facet.js';
import { mergeNearestPairIRs } from './irs.js';
import { mergeNearestPairStageView } from './merge-nearest-pair-stage.js';
import { mergeNearestPairScene } from './scene.js';

export { mergeNearestPairAlgorithm } from './algorithm.js';
export type { MergeNearestPairData, MergePoint } from './algorithm.js';
export {
  mergeNearestPairScene,
  beforeTreeOf,
  gapOf,
  heightsOf,
  lastJoinOf,
  lowHighOf,
  remainingOf,
  runnerUpOf,
  standingTreeOf,
  treeOf,
} from './scene.js';
export type {
  MergeDot,
  MergeJoin,
  MergeKnot,
  MergeNearestPairScene,
  MergePair,
  MergeStep,
  MergeTree,
} from './scene.js';
export { mergeNearestPairIRs } from './irs.js';
export { mergeNearestPairFacet } from './facet.js';
export { mergeNearestPairStageView } from './merge-nearest-pair-stage.js';

export function registerMergeNearestPair(): void {
  registerAlgorithm<MergeNearestPairData>('mergeNearestPair', mergeNearestPairAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('mergeNearestPairScene', mergeNearestPairScene);
  for (const ir of mergeNearestPairIRs) registerIR(ir.id, ir);
  registerView('merge-nearest-pair-stage', mergeNearestPairStageView);
  registerFacets([mergeNearestPairFacet]);
}
