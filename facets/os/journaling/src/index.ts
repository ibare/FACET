import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { journalingAlgorithm, type JournalingData } from './algorithm.js';
import { journalingFacet } from './facet.js';
import { journalingIRs } from './irs.js';
import { journalingStageView } from './journaling-stage.js';
import { journalingProjector } from './projector.js';

export * from './algorithm.js';
export { journalingProjector } from './projector.js';
export * from './irs.js';
export { journalingStageView, type JournalingStage } from './journaling-stage.js';
export * from './facet.js';

export function registerJournaling(): void {
  registerAlgorithm<JournalingData>('journaling', journalingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('journalingProjector', journalingProjector);
  for (const ir of journalingIRs) registerIR(ir.id, ir);
  registerView('journaling-stage', journalingStageView);
  registerFacets([journalingFacet]);
}
