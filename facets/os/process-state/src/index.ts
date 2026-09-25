import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { processStateAlgorithm, type ProcessStateData } from './algorithm.js';
import { processStateFacet } from './facet.js';
import { processStateIRs } from './irs.js';
import { processStateStageView } from './process-state-stage.js';
import { processStateProjector } from './projector.js';

export {
  processStateAlgorithm,
  simulateProcessState,
  validateProcessState,
  assertOnLadder,
  type ProcessStateData,
  type ProcessCard,
  type CardState,
  type TickRecord,
  type RoundRecord,
} from './algorithm.js';
export { processStateProjector } from './projector.js';
export { processStateImperativeIR, processStateIRs } from './irs.js';
export { processStateStageView } from './process-state-stage.js';
export { processStateFacet } from './facet.js';

export function registerProcessState(): void {
  registerAlgorithm<ProcessStateData>('processState', processStateAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('processStateProjector', processStateProjector);
  for (const ir of processStateIRs) registerIR(ir.id, ir);
  registerView('process-state-stage', processStateStageView);
  registerFacets([processStateFacet]);
}
