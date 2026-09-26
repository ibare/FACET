import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { frameBudgetAlgorithm } from './algorithm.js';
import { frameBudgetProjector } from './projector.js';
import { frameBudgetIRs } from './irs.js';
import { frameBudgetStageView } from './frame-budget-stage.js';
import { frameBudgetFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './frame-budget-stage.js';
export * from './facet.js';

export function registerFrameBudget(): void {
  registerAlgorithm('frameBudget', frameBudgetAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('frameBudgetProjector', frameBudgetProjector);
  for (const ir of frameBudgetIRs) registerIR(ir.id, ir);
  registerView('frame-budget-stage', frameBudgetStageView);
  registerFacets([frameBudgetFacet]);
}
