import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { natAlgorithm, type NatData } from './algorithm.js';
import { natProjector } from './projector.js';
import { natIRs } from './irs.js';
import { natStageView } from './nat-stage.js';
import { natFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './nat-stage.js';
export * from './facet.js';

export function registerNat(): void {
  registerAlgorithm<NatData>('nat', natAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('natProjector', natProjector);
  for (const ir of natIRs) registerIR(ir.id, ir);
  registerView('nat-stage', natStageView);
  registerFacets([natFacet]);
}
