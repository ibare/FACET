import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { budgetRunsOut, type BudgetRunsOutFacetData } from './algorithm.js';
import { budgetRunsOutScene } from './scene.js';
import { budgetRunsOutStageView } from './budget-runs-out-stage.js';
import { budgetRunsOutIRs } from './irs.js';
import { budgetRunsOutFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { budgetRunsOutStageView } from './budget-runs-out-stage.js';
export { budgetRunsOutIRs } from './irs.js';
export { budgetRunsOutFacet } from './facet.js';

export function registerBudgetRunsOut(): void {
  registerAlgorithm<BudgetRunsOutFacetData>('budgetRunsOut', budgetRunsOut, { mechanismKind: 'reactive' });
  registerScenePlan('budgetRunsOutScene', budgetRunsOutScene);
  for (const ir of budgetRunsOutIRs) registerIR(ir.id, ir);
  registerView('budget-runs-out-stage', budgetRunsOutStageView);
  registerFacets([budgetRunsOutFacet]);
}
