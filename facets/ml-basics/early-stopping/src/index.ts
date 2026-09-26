import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { earlyStoppingAlgorithm, type EarlyStoppingData } from './algorithm.js';
import { earlyStoppingProjector } from './projector.js';
import { earlyStoppingIRs } from './irs.js';
import { earlyStoppingStageView } from './early-stopping-stage.js';
import { earlyStoppingFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './early-stopping-stage.js';
export * from './facet.js';

export function registerEarlyStopping(): void {
  registerAlgorithm<EarlyStoppingData>('earlyStopping', earlyStoppingAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('earlyStoppingProjector', earlyStoppingProjector);
  for (const ir of earlyStoppingIRs) registerIR(ir.id, ir);
  registerView('early-stopping-stage', earlyStoppingStageView);
  registerFacets([earlyStoppingFacet]);
}
