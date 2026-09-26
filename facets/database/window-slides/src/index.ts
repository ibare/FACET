import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { windowSlides, type WindowSlidesFacetData } from './algorithm.js';
import { windowSlidesScene } from './scene.js';
import { windowSlidesIRs } from './irs.js';
import { windowSlidesStageView } from './window-slides-stage.js';
import { windowSlidesFacet } from './facet.js';

export { windowSlides, type WindowSlidesFacetData } from './algorithm.js';
export {
  windowSlidesScene,
  type WindowSlidesScene,
  type WindowSlidesBase,
  type WindowSlidesStep,
} from './scene.js';
export { windowSlidesIRs } from './irs.js';
export { windowSlidesStageView } from './window-slides-stage.js';
export { windowSlidesFacet } from './facet.js';

export function registerWindowSlides(): void {
  registerAlgorithm<WindowSlidesFacetData>('windowSlides', windowSlides, { mechanismKind: 'reactive' });
  registerScenePlan('windowSlidesScene', windowSlidesScene);
  for (const ir of windowSlidesIRs) registerIR(ir.id, ir);
  registerView('window-slides-stage', windowSlidesStageView);
  registerFacets([windowSlidesFacet]);
}
