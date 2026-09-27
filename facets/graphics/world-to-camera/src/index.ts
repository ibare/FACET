import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { worldToCamera, type WorldToCameraFacetData } from './algorithm.js';
import { worldToCameraScene } from './scene.js';
import { worldToCameraStageView } from './world-to-camera-stage.js';
import { worldToCameraIRs } from './irs.js';
import { worldToCameraFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './world-to-camera-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerWorldToCamera(): void {
  registerAlgorithm<WorldToCameraFacetData>('worldToCamera', worldToCamera, { mechanismKind: 'reactive' });
  registerScenePlan('worldToCameraScene', worldToCameraScene);
  for (const ir of worldToCameraIRs) registerIR(ir.id, ir);
  registerView('world-to-camera-stage', worldToCameraStageView);
  registerFacets([worldToCameraFacet]);
}
