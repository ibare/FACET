import { registerAlgorithm, registerProjector, registerIR, registerView, registerFacets } from '@ffacet/core/runtime';
import { repaintCostAlgorithm } from './algorithm.js';
import { repaintCostProjector } from './projector.js';
import { repaintCostIRs } from './irs.js';
import { repaintCostStageView } from './repaint-cost-stage.js';
import { repaintCostFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './repaint-cost-stage.js';
export * from './facet.js';

export function registerRepaintCost(): void {
  registerAlgorithm('repaintCost', repaintCostAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('repaintCostProjector', repaintCostProjector);
  for (const ir of repaintCostIRs) registerIR(ir.id, ir);
  registerView('repaint-cost-stage', repaintCostStageView);
  registerFacets([repaintCostFacet]);
}
