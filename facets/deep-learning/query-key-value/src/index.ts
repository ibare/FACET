import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { queryKeyValue, type QueryKeyValueFacetData } from './algorithm.js';
import { queryKeyValueScene } from './scene.js';
import { queryKeyValueStageView } from './query-key-value-stage.js';
import { queryKeyValueIRs } from './irs.js';
import { queryKeyValueFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './query-key-value-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerQueryKeyValue(): void {
  registerAlgorithm<QueryKeyValueFacetData>('queryKeyValue', queryKeyValue, { mechanismKind: 'reactive' });
  registerScenePlan('queryKeyValueScene', queryKeyValueScene);
  for (const ir of queryKeyValueIRs) registerIR(ir.id, ir);
  registerView('query-key-value-stage', queryKeyValueStageView);
  registerFacets([queryKeyValueFacet]);
}
