import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { extraDimensionForTranslate, type ExtraDimensionForTranslateFacetData } from './algorithm.js';
import { extraDimensionForTranslateScene } from './scene.js';
import { extraDimensionForTranslateStageView } from './extra-dimension-for-translate-stage.js';
import { extraDimensionForTranslateIRs } from './irs.js';
import { extraDimensionForTranslateFacet } from './facet.js';

export {
  extraDimensionForTranslate,
  narrowTranslateData,
  translationMatrix,
  multiply3,
  type ExtraDimensionForTranslateFacetData,
} from './algorithm.js';
export { extraDimensionForTranslateScene, type ExtraDimensionForTranslateScene } from './scene.js';
export { extraDimensionForTranslateStageView } from './extra-dimension-for-translate-stage.js';
export { extraDimensionForTranslateIRs } from './irs.js';
export { extraDimensionForTranslateFacet } from './facet.js';

export function registerExtraDimensionForTranslate(): void {
  registerAlgorithm<ExtraDimensionForTranslateFacetData>('extraDimensionForTranslate', extraDimensionForTranslate, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('extraDimensionForTranslateScene', extraDimensionForTranslateScene);
  for (const ir of extraDimensionForTranslateIRs) registerIR(ir.id, ir);
  registerView('extra-dimension-for-translate-stage', extraDimensionForTranslateStageView);
  registerFacets([extraDimensionForTranslateFacet]);
}
