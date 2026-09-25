import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { seekDistanceCosts, type SeekDistanceCostsFacetData } from './algorithm.js';
import { seekDistanceCostsScene } from './scene.js';
import { seekDistanceCostsIRs } from './irs.js';
import { seekDistanceCostsStageView } from './seek-distance-costs-stage.js';
import { seekDistanceCostsFacet } from './facet.js';

export { seekDistanceCosts, checkSeekData, type SeekDistanceCostsFacetData } from './algorithm.js';
export {
  seekDistanceCostsScene,
  type SeekScene,
  type SeekBase,
  type ServedRequest,
  type SeekSums,
  type SeekStep,
} from './scene.js';
export { seekDistanceCostsIRs } from './irs.js';
export { seekDistanceCostsStageView } from './seek-distance-costs-stage.js';
export { seekDistanceCostsFacet } from './facet.js';

export function registerSeekDistanceCosts(): void {
  registerAlgorithm<SeekDistanceCostsFacetData>('seekDistanceCosts', seekDistanceCosts, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('seekDistanceCostsScene', seekDistanceCostsScene);
  for (const ir of seekDistanceCostsIRs) registerIR(ir.id, ir);
  registerView('seek-distance-costs-stage', seekDistanceCostsStageView);
  registerFacets([seekDistanceCostsFacet]);
}
