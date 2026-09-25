/**
 * paging — 페이징과 TLB. 등록 진입점.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { pagingAlgorithm, type PagingData } from './algorithm.js';
import { pagingProjector } from './projector.js';
import { pagingIRs } from './irs.js';
import { pagingStageView } from './paging-stage.js';
import { pagingFacet } from './facet.js';

export { pagingAlgorithm, translateAll } from './algorithm.js';
export type { PagingData, PagingRun, Translation } from './algorithm.js';
export { pagingProjector } from './projector.js';
export { pagingImperativeIR, pagingIRs } from './irs.js';
export { pagingStageView } from './paging-stage.js';
export type { PagingStage, PagingStep, PagingSetup } from './paging-stage.js';
export { pagingFacet } from './facet.js';

export function registerPaging(): void {
  registerAlgorithm<PagingData>('paging', pagingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('pagingProjector', pagingProjector);
  for (const ir of pagingIRs) registerIR(ir.id, ir);
  registerView('paging-stage', pagingStageView);
  registerFacets([pagingFacet]);
}
