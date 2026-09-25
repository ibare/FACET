import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { encapsulationBoundary, type EncapsulationBoundaryFacetData } from './algorithm.js';
import { encapsulationBoundaryScene } from './scene.js';
import { encapsulationBoundaryIRs } from './irs.js';
import { encapsulationBoundaryStageView } from './encapsulation-boundary-stage.js';
import { encapsulationBoundaryFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './encapsulation-boundary-stage.js';
export * from './facet.js';

export function registerEncapsulationBoundary(): void {
  registerAlgorithm<EncapsulationBoundaryFacetData>('encapsulationBoundary', encapsulationBoundary, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('encapsulationBoundaryScene', encapsulationBoundaryScene);
  for (const ir of encapsulationBoundaryIRs) registerIR(ir.id, ir);
  registerView('encapsulation-boundary-stage', encapsulationBoundaryStageView);
  registerFacets([encapsulationBoundaryFacet]);
}
