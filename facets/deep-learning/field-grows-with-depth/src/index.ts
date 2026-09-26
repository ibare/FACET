import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { fieldGrowsWithDepth, type FieldGrowsWithDepthFacetData } from './algorithm.js';
import { fieldGrowsWithDepthScene } from './scene.js';
import { fieldGrowsWithDepthIRs } from './irs.js';
import { fieldGrowsWithDepthStageView } from './field-grows-with-depth-stage.js';
import { fieldGrowsWithDepthFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './field-grows-with-depth-stage.js';
export * from './facet.js';

export function registerFieldGrowsWithDepth(): void {
  registerAlgorithm<FieldGrowsWithDepthFacetData>('fieldGrowsWithDepth', fieldGrowsWithDepth, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('fieldGrowsWithDepthScene', fieldGrowsWithDepthScene);
  for (const ir of fieldGrowsWithDepthIRs) registerIR(ir.id, ir);
  registerView('field-grows-with-depth-stage', fieldGrowsWithDepthStageView);
  registerFacets([fieldGrowsWithDepthFacet]);
}
