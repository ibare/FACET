import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { pathResolution, type PathResolutionFacetData } from './algorithm.js';
import { pathResolutionScene } from './scene.js';
import { pathResolutionIRs } from './irs.js';
import { pathResolutionStageView } from './path-resolution-stage.js';
import { pathResolutionFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './path-resolution-stage.js';
export * from './facet.js';

export function registerPathResolution(): void {
  registerAlgorithm<PathResolutionFacetData>('pathResolution', pathResolution, { mechanismKind: 'reactive' });
  registerScenePlan('pathResolutionScene', pathResolutionScene);
  for (const ir of pathResolutionIRs) registerIR(ir.id, ir);
  registerView('path-resolution-stage', pathResolutionStageView);
  registerFacets([pathResolutionFacet]);
}
