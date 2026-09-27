import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { perspectiveShrinksFar, type PerspectiveShrinksFarFacetData } from './algorithm.js';
import { perspectiveShrinksFarScene } from './scene.js';
import { perspectiveShrinksFarStageView } from './perspective-shrinks-far-stage.js';
import { perspectiveShrinksFarIRs } from './irs.js';
import { perspectiveShrinksFarFacet } from './facet.js';

export {
  perspectiveShrinksFar,
  readShrinkData,
  depthOf,
  projectPost,
  type PerspectiveShrinksFarFacetData,
  type ShrinkPost,
  type ShrinkProjection,
} from './algorithm.js';
export { perspectiveShrinksFarScene, type PerspectiveShrinksFarScene, type ShrinkStep } from './scene.js';
export { perspectiveShrinksFarStageView } from './perspective-shrinks-far-stage.js';
export { perspectiveShrinksFarIRs } from './irs.js';
export { perspectiveShrinksFarFacet } from './facet.js';

export function registerPerspectiveShrinksFar(): void {
  registerAlgorithm<PerspectiveShrinksFarFacetData>('perspectiveShrinksFar', perspectiveShrinksFar, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('perspectiveShrinksFarScene', perspectiveShrinksFarScene);
  for (const ir of perspectiveShrinksFarIRs) registerIR(ir.id, ir);
  registerView('perspective-shrinks-far-stage', perspectiveShrinksFarStageView);
  registerFacets([perspectiveShrinksFarFacet]);
}
