import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { roundRobinLbAlgorithm, type RoundRobinLbData } from './algorithm.js';
import { roundRobinLbFacet } from './facet.js';
import { roundRobinLbIRs } from './irs.js';
import { roundRobinLbProjector } from './projector.js';
import { roundRobinLbStageView } from './round-robin-lb-stage.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './projector.js';
export * from './round-robin-lb-stage.js';

export function registerRoundRobinLb(): void {
  registerAlgorithm<RoundRobinLbData>('roundRobinLb', roundRobinLbAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('roundRobinLbProjector', roundRobinLbProjector);
  for (const ir of roundRobinLbIRs) registerIR(ir.id, ir);
  registerView('round-robin-lb-stage', roundRobinLbStageView);
  registerFacets([roundRobinLbFacet]);
}
