import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { columnOriented, type ColumnOrientedFacetData } from './algorithm.js';
import { columnOrientedFacet } from './facet.js';
import { columnOrientedIRs } from './irs.js';
import { columnOrientedScene } from './scene.js';
import { columnOrientedStageView } from './column-oriented-stage.js';

export * from './algorithm.js';
export * from './scene.js';
export { columnOrientedStageView } from './column-oriented-stage.js';
export { columnOrientedIRs } from './irs.js';
export { columnOrientedFacet } from './facet.js';

export function registerColumnOriented(): void {
  registerAlgorithm<ColumnOrientedFacetData>('columnOriented', columnOriented, { mechanismKind: 'reactive' });
  registerScenePlan('columnOrientedScene', columnOrientedScene);
  for (const ir of columnOrientedIRs) registerIR(ir.id, ir);
  registerView('column-oriented-stage', columnOrientedStageView);
  registerFacets([columnOrientedFacet]);
}
