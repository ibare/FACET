/**
 * learned-filter 진입점 — 모두 다시 내놓고 등록 함수 하나를 연다.
 * 손잡이(가려낼 무늬)가 있어 알고리즘은 reactive 로 등록한다.
 */
import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { learnedFilterAlgorithm, type LearnedFilterData } from './algorithm.js';
import { learnedFilterProjector } from './projector.js';
import { learnedFilterIRs } from './irs.js';
import { learnedFilterStageView } from './learned-filter-stage.js';
import { learnedFilterFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './learned-filter-stage.js';
export * from './facet.js';

export function registerLearnedFilter(): void {
  registerAlgorithm<LearnedFilterData>('learnedFilter', learnedFilterAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('learnedFilterProjector', learnedFilterProjector);
  for (const ir of learnedFilterIRs) registerIR(ir.id, ir);
  registerView('learned-filter-stage', learnedFilterStageView);
  registerFacets([learnedFilterFacet]);
}
