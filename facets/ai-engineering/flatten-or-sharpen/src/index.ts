import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { flattenOrSharpen, type FlattenOrSharpenFacetData } from './algorithm.js';
import { flattenOrSharpenScene } from './scene.js';
import { flattenOrSharpenIRs } from './irs.js';
import { flattenOrSharpenStageView } from './flatten-or-sharpen-stage.js';
import { flattenOrSharpenFacet } from './facet.js';

export { flattenOrSharpen, type FlattenOrSharpenFacetData } from './algorithm.js';
export {
  flattenOrSharpenScene,
  type FlattenOrSharpenScene,
  type FlattenOrSharpenBand,
  type FlattenOrSharpenStep,
} from './scene.js';
export { flattenOrSharpenIRs } from './irs.js';
export { flattenOrSharpenStageView } from './flatten-or-sharpen-stage.js';
export { flattenOrSharpenFacet } from './facet.js';

export function registerFlattenOrSharpen(): void {
  registerAlgorithm<FlattenOrSharpenFacetData>('flattenOrSharpen', flattenOrSharpen, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('flattenOrSharpenScene', flattenOrSharpenScene);
  for (const ir of flattenOrSharpenIRs) registerIR(ir.id, ir);
  registerView('flatten-or-sharpen-stage', flattenOrSharpenStageView);
  registerFacets([flattenOrSharpenFacet]);
}
