import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { costModelAlgorithm, type CostModelData } from './algorithm.js';
import { costModelProjector } from './projector.js';
import { costModelIRs } from './irs.js';
import { costModelStageView } from './cost-model-stage.js';
import { costModelFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './cost-model-stage.js';
export * from './facet.js';

export function registerCostModel(): void {
  registerAlgorithm<CostModelData>('costModel', costModelAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('costModelProjector', costModelProjector);
  for (const ir of costModelIRs) registerIR(ir.id, ir);
  registerView('cost-model-stage', costModelStageView);
  registerFacets([costModelFacet]);
}
