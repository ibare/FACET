import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { queryInsideQuery, type QueryInsideQueryFacetData } from './algorithm.js';
import { queryInsideQueryScene } from './scene.js';
import { queryInsideQueryStageView } from './query-inside-query-stage.js';
import { queryInsideQueryIRs } from './irs.js';
import { queryInsideQueryFacet } from './facet.js';

export { queryInsideQuery, columnIndex } from './algorithm.js';
export type { QueryInsideQueryFacetData, QueryCell } from './algorithm.js';
export { queryInsideQueryScene } from './scene.js';
export type { QueryInsideQueryScene, InnerAnswer } from './scene.js';
export { queryInsideQueryStageView } from './query-inside-query-stage.js';
export { queryInsideQueryIRs } from './irs.js';
export { queryInsideQueryFacet } from './facet.js';

export function registerQueryInsideQuery(): void {
  registerAlgorithm<QueryInsideQueryFacetData>('queryInsideQuery', queryInsideQuery, { mechanismKind: 'reactive' });
  registerScenePlan('queryInsideQueryScene', queryInsideQueryScene);
  for (const ir of queryInsideQueryIRs) registerIR(ir.id, ir);
  registerView('query-inside-query-stage', queryInsideQueryStageView);
  registerFacets([queryInsideQueryFacet]);
}
