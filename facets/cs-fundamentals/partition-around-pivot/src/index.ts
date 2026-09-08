/**
 * partition-around-pivot 조각의 등록 진입점.
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

import { partitionAroundPivotAlgorithm, type PartitionAroundPivotData } from './algorithm.js';
import { partitionAroundPivotProjector } from './projector.js';
import { partitionAroundPivotIRs } from './irs.js';
import { partitionAroundPivotStageView } from './partition-around-pivot-stage.js';
import { partitionAroundPivotFacet } from './facet.js';
import { partitionAroundPivotDescription } from './description.js';

export function registerPartitionAroundPivot(): void {
  registerAlgorithm<PartitionAroundPivotData>(
    'partitionAroundPivot',
    partitionAroundPivotAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerProjector('partitionAroundPivotProjector', partitionAroundPivotProjector);
  for (const ir of partitionAroundPivotIRs) registerIR(ir.id, ir);
  registerView('partition-around-pivot-stage', partitionAroundPivotStageView);
  registerFacets([partitionAroundPivotFacet]);
  registerDescription(partitionAroundPivotFacet.id, partitionAroundPivotDescription);
}

export { partitionAroundPivotAlgorithm } from './algorithm.js';
export type { PartitionAroundPivotData, PartitionSide } from './algorithm.js';
export { partitionAroundPivotProjector } from './projector.js';
export { partitionAroundPivotIRs } from './irs.js';
export { partitionAroundPivotStageView } from './partition-around-pivot-stage.js';
export { partitionAroundPivotFacet } from './facet.js';
export { partitionAroundPivotDescription } from './description.js';
