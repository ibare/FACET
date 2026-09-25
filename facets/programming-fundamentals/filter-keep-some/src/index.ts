import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { filterKeepSome, type FilterKeepSomeFacetData } from './algorithm';
import { filterKeepSomeFacet } from './facet';
import { filterKeepSomeIRs } from './irs';
import { filterKeepSomeScene } from './scene';
import { filterKeepSomeStageView } from './filter-keep-some-stage';

export * from './algorithm';
export * from './scene';
export * from './filter-keep-some-stage';
export * from './irs';
export * from './facet';

export function registerFilterKeepSome(): void {
  registerAlgorithm<FilterKeepSomeFacetData>('filterKeepSome', filterKeepSome, { mechanismKind: 'reactive' });
  registerScenePlan('filterKeepSomeScene', filterKeepSomeScene);
  for (const ir of filterKeepSomeIRs) registerIR(ir.id, ir);
  registerView('filter-keep-some-stage', filterKeepSomeStageView);
  registerFacets([filterKeepSomeFacet]);
}
