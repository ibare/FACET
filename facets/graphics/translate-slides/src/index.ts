import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { translateSlides, type TranslateSlidesFacetData } from './algorithm.js';
import { translateSlidesScene } from './scene.js';
import { translateSlidesStageView } from './translate-slides-stage.js';
import { translateSlidesIRs } from './irs.js';
import { translateSlidesFacet } from './facet.js';

export { translateSlides, narrowTranslateSlidesData, type TranslateSlidesFacetData } from './algorithm.js';
export { translateSlidesScene, type TranslateSlidesScene } from './scene.js';
export { translateSlidesStageView } from './translate-slides-stage.js';
export { translateSlidesIRs } from './irs.js';
export { translateSlidesFacet } from './facet.js';

export function registerTranslateSlides(): void {
  registerAlgorithm<TranslateSlidesFacetData>('translateSlides', translateSlides, { mechanismKind: 'reactive' });
  registerScenePlan('translateSlidesScene', translateSlidesScene);
  for (const ir of translateSlidesIRs) registerIR(ir.id, ir);
  registerView('translate-slides-stage', translateSlidesStageView);
  registerFacets([translateSlidesFacet]);
}
