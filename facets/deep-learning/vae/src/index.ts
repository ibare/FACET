import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { vaeAlgorithm, type VaeData } from './algorithm.js';
import { vaeFacet } from './facet.js';
import { vaeIRs } from './irs.js';
import { vaeProjector } from './projector.js';
import { vaeStageView } from './vae-stage.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './vae-stage.js';
export * from './facet.js';

export function registerVae(): void {
  registerAlgorithm<VaeData>('vae', vaeAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('vaeProjector', vaeProjector);
  for (const ir of vaeIRs) registerIR(ir.id, ir);
  registerView('vae-stage', vaeStageView);
  registerFacets([vaeFacet]);
}
