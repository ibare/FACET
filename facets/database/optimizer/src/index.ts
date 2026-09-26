import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { optimizerAlgorithm, type OptimizerData } from './algorithm.js';
import { optimizerFacet } from './facet.js';
import { optimizerIRs } from './irs.js';
import { optimizerStageView } from './optimizer-stage.js';
import { optimizerProjector } from './projector.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './optimizer-stage.js';
export * from './facet.js';

export function registerOptimizer(): void {
  registerAlgorithm<OptimizerData>('optimizer', optimizerAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('optimizerProjector', optimizerProjector);
  for (const ir of optimizerIRs) registerIR(ir.id, ir);
  registerView('optimizer-stage', optimizerStageView);
  registerFacets([optimizerFacet]);
}
