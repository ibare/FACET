import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { normalDecidesBrightness, type NormalDecidesBrightnessFacetData } from './algorithm.js';
import { normalDecidesBrightnessScene } from './scene.js';
import { normalDecidesBrightnessIRs } from './irs.js';
import { normalDecidesBrightnessStageView } from './normal-decides-brightness-stage.js';
import { normalDecidesBrightnessFacet } from './facet.js';

export {
  normalDecidesBrightness,
  narrowNormalDecidesBrightnessData,
  faceNormal,
  coverLength,
  lambert,
  type NormalDecidesBrightnessFacetData,
} from './algorithm.js';
export { normalDecidesBrightnessScene, type NormalDecidesBrightnessScene } from './scene.js';
export { normalDecidesBrightnessIRs } from './irs.js';
export { normalDecidesBrightnessStageView } from './normal-decides-brightness-stage.js';
export { normalDecidesBrightnessFacet } from './facet.js';

export function registerNormalDecidesBrightness(): void {
  registerAlgorithm<NormalDecidesBrightnessFacetData>('normalDecidesBrightness', normalDecidesBrightness, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('normalDecidesBrightnessScene', normalDecidesBrightnessScene);
  for (const ir of normalDecidesBrightnessIRs) registerIR(ir.id, ir);
  registerView('normal-decides-brightness-stage', normalDecidesBrightnessStageView);
  registerFacets([normalDecidesBrightnessFacet]);
}
