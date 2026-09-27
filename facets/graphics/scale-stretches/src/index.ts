import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { scaleStretches, type ScaleStretchesFacetData } from './algorithm.js';
import { scaleStretchesScene } from './scene.js';
import { scaleStretchesStageView } from './scale-stretches-stage.js';
import { scaleStretchesIRs } from './irs.js';
import { scaleStretchesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './scale-stretches-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerScaleStretches(): void {
  registerAlgorithm<ScaleStretchesFacetData>('scaleStretches', scaleStretches, { mechanismKind: 'reactive' });
  registerScenePlan('scaleStretchesScene', scaleStretchesScene);
  for (const ir of scaleStretchesIRs) registerIR(ir.id, ir);
  registerView('scale-stretches-stage', scaleStretchesStageView);
  registerFacets([scaleStretchesFacet]);
}
