import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { triangleToPixels } from './algorithm.js';
import type { TriangleToPixelsFacetData } from './algorithm.js';
import { triangleToPixelsScene } from './scene.js';
import { triangleToPixelsStageView } from './triangle-to-pixels-stage.js';
import { triangleToPixelsIRs } from './irs.js';
import { triangleToPixelsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './triangle-to-pixels-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerTriangleToPixels(): void {
  registerAlgorithm<TriangleToPixelsFacetData>('triangleToPixels', triangleToPixels, { mechanismKind: 'reactive' });
  registerScenePlan('triangleToPixelsScene', triangleToPixelsScene);
  for (const ir of triangleToPixelsIRs) registerIR(ir.id, ir);
  registerView('triangle-to-pixels-stage', triangleToPixelsStageView);
  registerFacets([triangleToPixelsFacet]);
}
