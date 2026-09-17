/**
 * partition-around-pivot 조각의 등록 진입점.
 *
 * 사이드 이펙트로 스스로 부르지 않는다 — 호출 책임은 호스트 앱에 있다 (S-facet).
 *
 * 화면은 장면(Scene) 방식이다 — projector 대신 `scene.ts` 의 `ScenePlan` 을 등록하고,
 * stage 가 `render` 하나로 산다 (S-scene).
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { partitionAroundPivotAlgorithm, type PartitionAroundPivotData } from './algorithm.js';
import { partitionAroundPivotScene } from './scene.js';
import { partitionAroundPivotIRs } from './irs.js';
import { partitionAroundPivotStageView } from './partition-around-pivot-stage.js';
import { partitionAroundPivotFacet } from './facet.js';

export function registerPartitionAroundPivot(): void {
  registerAlgorithm<PartitionAroundPivotData>(
    'partitionAroundPivot',
    partitionAroundPivotAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerScenePlan('partitionAroundPivotScene', partitionAroundPivotScene);
  for (const ir of partitionAroundPivotIRs) registerIR(ir.id, ir);
  registerView('partition-around-pivot-stage', partitionAroundPivotStageView);
  registerFacets([partitionAroundPivotFacet]);
}

export { partitionAroundPivotAlgorithm } from './algorithm.js';
export type { PartitionAroundPivotData, PartitionSide } from './algorithm.js';
export { partitionAroundPivotScene } from './scene.js';
export type { PartitionAroundPivotScene } from './scene.js';
export { partitionAroundPivotIRs } from './irs.js';
export { partitionAroundPivotStageView } from './partition-around-pivot-stage.js';
export { partitionAroundPivotFacet } from './facet.js';
