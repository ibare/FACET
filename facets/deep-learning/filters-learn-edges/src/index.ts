import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { filtersLearnEdges, type FiltersLearnEdgesFacetData } from './algorithm.js';
import { filtersLearnEdgesScene } from './scene.js';
import { filtersLearnEdgesStageView } from './filters-learn-edges-stage.js';
import { filtersLearnEdgesIRs } from './irs.js';
import { filtersLearnEdgesFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { filtersLearnEdgesStageView } from './filters-learn-edges-stage.js';
export { filtersLearnEdgesIRs } from './irs.js';
export { filtersLearnEdgesFacet } from './facet.js';

export function registerFiltersLearnEdges(): void {
  registerAlgorithm<FiltersLearnEdgesFacetData>('filtersLearnEdges', filtersLearnEdges, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('filtersLearnEdgesScene', filtersLearnEdgesScene);
  for (const ir of filtersLearnEdgesIRs) registerIR(ir.id, ir);
  registerView('filters-learn-edges-stage', filtersLearnEdgesStageView);
  registerFacets([filtersLearnEdgesFacet]);
}
