import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { clocksDrift, type ClocksDriftFacetData } from './algorithm.js';
import { clocksDriftScene } from './scene.js';
import { clocksDriftStageView } from './clocks-drift-stage.js';
import { clocksDriftIRs } from './irs.js';
import { clocksDriftFacet } from './facet.js';

export { clocksDrift, narrowClocksDriftData, type ClocksDriftFacetData } from './algorithm.js';
export { clocksDriftScene, type ClocksDriftScene } from './scene.js';
export { clocksDriftStageView } from './clocks-drift-stage.js';
export { clocksDriftIRs } from './irs.js';
export { clocksDriftFacet } from './facet.js';

export function registerClocksDrift(): void {
  registerAlgorithm<ClocksDriftFacetData>('clocksDrift', clocksDrift, { mechanismKind: 'reactive' });
  registerScenePlan('clocksDriftScene', clocksDriftScene);
  for (const ir of clocksDriftIRs) registerIR(ir.id, ir);
  registerView('clocks-drift-stage', clocksDriftStageView);
  registerFacets([clocksDriftFacet]);
}
