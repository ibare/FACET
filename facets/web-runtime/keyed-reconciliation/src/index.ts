/**
 * keyed-reconciliation — 등록 진입점.
 *
 * 순서: algorithm(mechanismKind: 'reactive') → projector → IR → view → facet.
 */
import { registerAlgorithm, registerProjector, registerIR, registerView, registerFacets } from '@ffacet/core/runtime';
import { keyedReconciliationAlgorithm } from './algorithm.js';
import { keyedReconciliationProjector } from './projector.js';
import { keyedReconciliationIRs } from './irs.js';
import { keyedReconciliationStageView } from './keyed-reconciliation-stage.js';
import { keyedReconciliationFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './keyed-reconciliation-stage.js';
export * from './facet.js';

export function registerKeyedReconciliation(): void {
  registerAlgorithm('keyedReconciliation', keyedReconciliationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('keyedReconciliationProjector', keyedReconciliationProjector);
  for (const ir of keyedReconciliationIRs) registerIR(ir.id, ir);
  registerView('keyed-reconciliation-stage', keyedReconciliationStageView);
  registerFacets([keyedReconciliationFacet]);
}
