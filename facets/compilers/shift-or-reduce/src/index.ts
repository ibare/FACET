import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { shiftOrReduce, type ShiftOrReduceFacetData } from './algorithm.js';
import { shiftOrReduceScene } from './scene.js';
import { shiftOrReduceStageView } from './shift-or-reduce-stage.js';
import { shiftOrReduceIRs } from './irs.js';
import { shiftOrReduceFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { shiftOrReduceStageView } from './shift-or-reduce-stage.js';
export { shiftOrReduceIRs } from './irs.js';
export { shiftOrReduceFacet } from './facet.js';

export function registerShiftOrReduce(): void {
  registerAlgorithm<ShiftOrReduceFacetData>('shiftOrReduce', shiftOrReduce, { mechanismKind: 'reactive' });
  registerScenePlan('shiftOrReduceScene', shiftOrReduceScene);
  for (const ir of shiftOrReduceIRs) registerIR(ir.id, ir);
  registerView('shift-or-reduce-stage', shiftOrReduceStageView);
  registerFacets([shiftOrReduceFacet]);
}
