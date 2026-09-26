import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { bulkheadAlgorithm, type BulkheadData } from './algorithm.js';
import { bulkheadProjector } from './projector.js';
import { bulkheadIRs } from './irs.js';
import { bulkheadStageView } from './bulkhead-stage.js';
import { bulkheadFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './bulkhead-stage.js';
export * from './facet.js';

export function registerBulkhead(): void {
  registerAlgorithm<BulkheadData>('bulkhead', bulkheadAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('bulkheadProjector', bulkheadProjector);
  for (const ir of bulkheadIRs) registerIR(ir.id, ir);
  registerView('bulkhead-stage', bulkheadStageView);
  registerFacets([bulkheadFacet]);
}
