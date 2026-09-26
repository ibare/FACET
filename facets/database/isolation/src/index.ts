import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { isolationAlgorithm, type IsolationData } from './algorithm.js';
import { isolationFacet } from './facet.js';
import { isolationIRs } from './irs.js';
import { isolationStageView } from './isolation-stage.js';
import { isolationProjector } from './projector.js';

export { isolationAlgorithm, simulateIsolation, opLabel } from './algorithm.js';
export type { IsolationData, IsolationOp, IsolationRun, IsolationStep } from './algorithm.js';
export { isolationProjector, readStepPayload } from './projector.js';
export { isolationIRs } from './irs.js';
export { isolationStageView } from './isolation-stage.js';
export type { IsolationStageApi, StageFrame } from './isolation-stage.js';
export { isolationFacet } from './facet.js';

export function registerIsolation(): void {
  registerAlgorithm<IsolationData>('isolation', isolationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('isolationProjector', isolationProjector);
  for (const ir of isolationIRs) registerIR(ir.id, ir);
  registerView('isolation-stage', isolationStageView);
  registerFacets([isolationFacet]);
}
