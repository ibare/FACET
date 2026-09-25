import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { recencyReorder, type RecencyReorderFacetData } from './algorithm.js';
import { recencyReorderScene } from './scene.js';
import { recencyReorderStageView } from './recency-reorder-stage.js';
import { recencyReorderIRs } from './irs.js';
import { recencyReorderFacet } from './facet.js';

export { recencyReorder, checkRecencyData, type RecencyReorderFacetData } from './algorithm.js';
export { recencyReorderScene, type RecencyScene, type RecencyColumn } from './scene.js';
export { recencyReorderStageView } from './recency-reorder-stage.js';
export { recencyReorderIRs } from './irs.js';
export { recencyReorderFacet } from './facet.js';

export function registerRecencyReorder(): void {
  registerAlgorithm<RecencyReorderFacetData>('recencyReorder', recencyReorder, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('recencyReorderScene', recencyReorderScene);
  for (const ir of recencyReorderIRs) registerIR(ir.id, ir);
  registerView('recency-reorder-stage', recencyReorderStageView);
  registerFacets([recencyReorderFacet]);
}
