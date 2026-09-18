import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { hybridSearchAlgorithm, type HybridSearchData } from './algorithm.js';
import { hybridSearchProjector } from './projector.js';
import { hybridSearchIRs } from './irs.js';
import { hybridSearchStageView } from './hybrid-search-stage.js';
import { hybridSearchFacet } from './facet.js';

export {
  hybridSearchAlgorithm,
  computeBase,
  fuse,
  tokenize,
  type HybridSearchData,
  type HybridSearchDoc,
  type HybridSearchBase,
  type HybridSearchFusion,
} from './algorithm.js';
export { hybridSearchProjector } from './projector.js';
export { hybridSearchImperativeIR, hybridSearchIRs } from './irs.js';
export { hybridSearchStageView, type HybridStage, type HybridStageDoc } from './hybrid-search-stage.js';
export { hybridSearchFacet } from './facet.js';

export function registerHybridSearch(): void {
  registerAlgorithm<HybridSearchData>('hybridSearch', hybridSearchAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('hybridSearchProjector', hybridSearchProjector);
  for (const ir of hybridSearchIRs) registerIR(ir.id, ir);
  registerView('hybrid-search-stage', hybridSearchStageView);
  registerFacets([hybridSearchFacet]);
}
