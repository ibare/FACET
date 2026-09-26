import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { dependencyResolutionAlgorithm, type DependencyResolutionData } from './algorithm.js';
import { dependencyResolutionFacet } from './facet.js';
import { dependencyResolutionIRs } from './irs.js';
import { dependencyResolutionProjector } from './projector.js';
import { dependencyResolutionStageView } from './dependency-resolution-stage.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './dependency-resolution-stage.js';
export * from './facet.js';

export function registerDependencyResolution(): void {
  registerAlgorithm<DependencyResolutionData>('dependencyResolution', dependencyResolutionAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('dependencyResolutionProjector', dependencyResolutionProjector);
  for (const ir of dependencyResolutionIRs) registerIR(ir.id, ir);
  registerView('dependency-resolution-stage', dependencyResolutionStageView);
  registerFacets([dependencyResolutionFacet]);
}
