import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { cooperativeYieldingAlgorithm, type CooperativeYieldingData } from './algorithm.js';
import { cooperativeYieldingProjector } from './projector.js';
import { cooperativeYieldingIRs } from './irs.js';
import { cooperativeYieldingStageView } from './cooperative-yielding-stage.js';
import { cooperativeYieldingFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './cooperative-yielding-stage.js';
export * from './facet.js';

export function registerCooperativeYielding(): void {
  registerAlgorithm<CooperativeYieldingData>('cooperativeYielding', cooperativeYieldingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('cooperativeYieldingProjector', cooperativeYieldingProjector);
  for (const ir of cooperativeYieldingIRs) registerIR(ir.id, ir);
  registerView('cooperative-yielding-stage', cooperativeYieldingStageView);
  registerFacets([cooperativeYieldingFacet]);
}
