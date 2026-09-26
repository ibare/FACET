import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { consistencyModelAlgorithm, type ConsistencyModelData } from './algorithm.js';
import { consistencyModelProjector } from './projector.js';
import { consistencyModelIRs } from './irs.js';
import { consistencyModelStageView } from './consistency-model-stage.js';
import { consistencyModelFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './consistency-model-stage.js';
export * from './facet.js';

export function registerConsistencyModel(): void {
  registerAlgorithm<ConsistencyModelData>('consistencyModel', consistencyModelAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('consistencyModelProjector', consistencyModelProjector);
  for (const ir of consistencyModelIRs) registerIR(ir.id, ir);
  registerView('consistency-model-stage', consistencyModelStageView);
  registerFacets([consistencyModelFacet]);
}
