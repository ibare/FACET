import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { justBeforePaint, type JustBeforePaintFacetData } from './algorithm.js';
import { justBeforePaintScene } from './scene.js';
import { justBeforePaintStageView } from './just-before-paint-stage.js';
import { justBeforePaintIRs } from './irs.js';
import { justBeforePaintFacet } from './facet.js';

export { justBeforePaint, type JustBeforePaintFacetData } from './algorithm.js';
export { justBeforePaintScene, type JustBeforePaintScene, type JustBeforePaintStep, type ArrivedMessage } from './scene.js';
export { justBeforePaintStageView } from './just-before-paint-stage.js';
export { justBeforePaintIRs } from './irs.js';
export { justBeforePaintFacet } from './facet.js';

export function registerJustBeforePaint(): void {
  registerAlgorithm<JustBeforePaintFacetData>('justBeforePaint', justBeforePaint, { mechanismKind: 'reactive' });
  registerScenePlan('justBeforePaintScene', justBeforePaintScene);
  for (const ir of justBeforePaintIRs) registerIR(ir.id, ir);
  registerView('just-before-paint-stage', justBeforePaintStageView);
  registerFacets([justBeforePaintFacet]);
}
