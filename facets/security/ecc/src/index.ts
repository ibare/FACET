import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { eccAlgorithm } from './algorithm.js';
import type { EccData } from './algorithm.js';
import { eccProjector } from './projector.js';
import { eccIRs } from './irs.js';
import { eccStageView } from './ecc-stage.js';
import { eccFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './ecc-stage.js';
export * from './facet.js';

export function registerEcc(): void {
  registerAlgorithm<EccData>('ecc', eccAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('eccProjector', eccProjector);
  for (const ir of eccIRs) registerIR(ir.id, ir);
  registerView('ecc-stage', eccStageView);
  registerFacets([eccFacet]);
}
