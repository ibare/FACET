import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { determinantArea, type DeterminantAreaFacetData } from './algorithm.js';
import { determinantAreaScene } from './scene.js';
import { determinantAreaStageView } from './determinant-area-stage.js';
import { determinantAreaIRs } from './irs.js';
import { determinantAreaFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './determinant-area-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerDeterminantArea(): void {
  registerAlgorithm<DeterminantAreaFacetData>('determinantArea', determinantArea, { mechanismKind: 'reactive' });
  registerScenePlan('determinantAreaScene', determinantAreaScene);
  for (const ir of determinantAreaIRs) registerIR(ir.id, ir);
  registerView('determinant-area-stage', determinantAreaStageView);
  registerFacets([determinantAreaFacet]);
}
