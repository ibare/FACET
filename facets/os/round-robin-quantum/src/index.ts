/**
 * round-robin-quantum — 라운드 로빈의 몫과 바꾸는 데 드는 틱.
 */

import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { roundRobinQuantumAlgorithm, type RoundRobinQuantumData } from './algorithm.js';
import { roundRobinQuantumFacet } from './facet.js';
import { roundRobinQuantumIRs } from './irs.js';
import { roundRobinQuantumProjector } from './projector.js';
import { roundRobinQuantumStageView } from './round-robin-quantum-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './round-robin-quantum-stage.js';

export function registerRoundRobinQuantum(): void {
  registerAlgorithm<RoundRobinQuantumData>('roundRobinQuantum', roundRobinQuantumAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('roundRobinQuantumProjector', roundRobinQuantumProjector);
  for (const ir of roundRobinQuantumIRs) registerIR(ir.id, ir);
  registerView('round-robin-quantum-stage', roundRobinQuantumStageView);
  registerFacets([roundRobinQuantumFacet]);
}
