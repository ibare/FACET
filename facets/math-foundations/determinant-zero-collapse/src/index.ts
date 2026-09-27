import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { determinantZeroCollapse, type DeterminantZeroCollapseFacetData } from './algorithm.js';
import { determinantZeroCollapseScene } from './scene.js';
import { determinantZeroCollapseStageView } from './determinant-zero-collapse-stage.js';
import { determinantZeroCollapseIRs } from './irs.js';
import { determinantZeroCollapseFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './determinant-zero-collapse-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerDeterminantZeroCollapse(): void {
  registerAlgorithm<DeterminantZeroCollapseFacetData>('determinantZeroCollapse', determinantZeroCollapse, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('determinantZeroCollapseScene', determinantZeroCollapseScene);
  for (const ir of determinantZeroCollapseIRs) registerIR(ir.id, ir);
  registerView('determinant-zero-collapse-stage', determinantZeroCollapseStageView);
  registerFacets([determinantZeroCollapseFacet]);
}
