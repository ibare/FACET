import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { threeWayMergeAlgorithm, type ThreeWayMergeData } from './algorithm.js';
import { threeWayMergeProjector } from './projector.js';
import { threeWayMergeIRs } from './irs.js';
import { threeWayMergeStageView } from './three-way-merge-stage.js';
import { threeWayMergeFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './three-way-merge-stage.js';
export * from './facet.js';

export function registerThreeWayMerge(): void {
  registerAlgorithm<ThreeWayMergeData>('threeWayMerge', threeWayMergeAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('threeWayMergeProjector', threeWayMergeProjector);
  for (const ir of threeWayMergeIRs) registerIR(ir.id, ir);
  registerView('three-way-merge-stage', threeWayMergeStageView);
  registerFacets([threeWayMergeFacet]);
}
