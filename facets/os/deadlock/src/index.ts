import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { deadlockAlgorithm, type DeadlockData } from './algorithm.js';
import { deadlockProjector } from './projector.js';
import { deadlockIRs } from './irs.js';
import { deadlockStageView } from './deadlock-stage.js';
import { deadlockFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './deadlock-stage.js';
export * from './facet.js';

export function registerDeadlock(): void {
  registerAlgorithm<DeadlockData>('deadlock', deadlockAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('deadlockProjector', deadlockProjector);
  for (const ir of deadlockIRs) registerIR(ir.id, ir);
  registerView('deadlock-stage', deadlockStageView);
  registerFacets([deadlockFacet]);
}
