import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { meanAndSpread, type MeanAndSpreadFacetData } from './algorithm.js';
import { meanAndSpreadScene } from './scene.js';
import { meanAndSpreadStageView } from './mean-and-spread-stage.js';
import { meanAndSpreadIRs } from './irs.js';
import { meanAndSpreadFacet } from './facet.js';

export { meanAndSpread, narrowMeanAndSpreadData, formatNumber, type MeanAndSpreadFacetData } from './algorithm.js';
export { meanAndSpreadScene, type MeanAndSpreadScene, type MeanAndSpreadStep } from './scene.js';
export { meanAndSpreadStageView } from './mean-and-spread-stage.js';
export { meanAndSpreadIRs } from './irs.js';
export { meanAndSpreadFacet } from './facet.js';

export function registerMeanAndSpread(): void {
  registerAlgorithm<MeanAndSpreadFacetData>('meanAndSpread', meanAndSpread, { mechanismKind: 'reactive' });
  registerScenePlan('meanAndSpreadScene', meanAndSpreadScene);
  for (const ir of meanAndSpreadIRs) registerIR(ir.id, ir);
  registerView('mean-and-spread-stage', meanAndSpreadStageView);
  registerFacets([meanAndSpreadFacet]);
}
