import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { overfittingAlgorithm, type OverfittingData } from './algorithm.js';
import { overfittingProjector } from './projector.js';
import { overfittingIRs } from './irs.js';
import { overfittingStageView } from './overfitting-stage.js';
import { overfittingFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './overfitting-stage.js';
export * from './facet.js';

export function registerOverfitting(): void {
  registerAlgorithm<OverfittingData>('overfitting', overfittingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('overfittingProjector', overfittingProjector);
  for (const ir of overfittingIRs) registerIR(ir.id, ir);
  registerView('overfitting-stage', overfittingStageView);
  registerFacets([overfittingFacet]);
}
