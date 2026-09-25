/**
 * polymorphism — 등록. 손잡이가 있으므로 reactive.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { polymorphismAlgorithm, type PolymorphismData } from './algorithm.js';
import { polymorphismProjector } from './projector.js';
import { polymorphismIRs } from './irs.js';
import { polymorphismStageView } from './polymorphism-stage.js';
import { polymorphismFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './polymorphism-stage.js';
export * from './facet.js';

export function registerPolymorphism(): void {
  registerAlgorithm<PolymorphismData>('polymorphism', polymorphismAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('polymorphismProjector', polymorphismProjector);
  for (const ir of polymorphismIRs) registerIR(ir.id, ir);
  registerView('polymorphism-stage', polymorphismStageView);
  registerFacets([polymorphismFacet]);
}
