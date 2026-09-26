import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { gatedCellsAlgorithm, type GatedCellsData } from './algorithm.js';
import { gatedCellsFacet } from './facet.js';
import { gatedCellsStageView } from './gated-cells-stage.js';
import { gatedCellsIRs } from './irs.js';
import { gatedCellsProjector } from './projector.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './gated-cells-stage.js';
export * from './facet.js';

export function registerGatedCells(): void {
  registerAlgorithm<GatedCellsData>('gatedCells', gatedCellsAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('gatedCellsProjector', gatedCellsProjector);
  for (const ir of gatedCellsIRs) registerIR(ir.id, ir);
  registerView('gated-cells-stage', gatedCellsStageView);
  registerFacets([gatedCellsFacet]);
}
