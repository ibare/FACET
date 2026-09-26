import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { hoistInvariant, type HoistInvariantFacetData } from './algorithm.js';
import { hoistInvariantScene } from './scene.js';
import { hoistInvariantIRs } from './irs.js';
import { hoistInvariantStageView } from './hoist-invariant-stage.js';
import { hoistInvariantFacet } from './facet.js';

export { hoistInvariant, type HoistInvariantFacetData } from './algorithm.js';
export { hoistInvariantScene, type HoistInvariantScene } from './scene.js';
export { hoistInvariantIRs } from './irs.js';
export { hoistInvariantStageView } from './hoist-invariant-stage.js';
export { hoistInvariantFacet } from './facet.js';

export function registerHoistInvariant(): void {
  registerAlgorithm<HoistInvariantFacetData>('hoistInvariant', hoistInvariant, { mechanismKind: 'reactive' });
  registerScenePlan('hoistInvariantScene', hoistInvariantScene);
  for (const ir of hoistInvariantIRs) registerIR(ir.id, ir);
  registerView('hoist-invariant-stage', hoistInvariantStageView);
  registerFacets([hoistInvariantFacet]);
}
