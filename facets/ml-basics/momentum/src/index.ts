import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { momentumAlgorithm, type MomentumData } from './algorithm.js';
import { momentumProjector } from './projector.js';
import { momentumIRs } from './irs.js';
import { momentumStageView } from './momentum-stage.js';
import { momentumFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './momentum-stage.js';
export * from './facet.js';

export function registerMomentum(): void {
  registerAlgorithm<MomentumData>('momentum', momentumAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('momentumProjector', momentumProjector);
  for (const ir of momentumIRs) registerIR(ir.id, ir);
  registerView('momentum-stage', momentumStageView);
  registerFacets([momentumFacet]);
}
