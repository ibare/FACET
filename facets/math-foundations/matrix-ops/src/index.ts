import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { matrixOpsAlgorithm, type MatrixOpsData } from './algorithm.js';
import { matrixOpsProjector } from './projector.js';
import { matrixOpsIRs } from './irs.js';
import { matrixOpsStageView } from './matrix-ops-stage.js';
import { matrixOpsFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './matrix-ops-stage.js';
export * from './facet.js';

export function registerMatrixOps(): void {
  registerAlgorithm<MatrixOpsData>('matrixOps', matrixOpsAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('matrixOpsProjector', matrixOpsProjector);
  for (const ir of matrixOpsIRs) registerIR(ir.id, ir);
  registerView('matrix-ops-stage', matrixOpsStageView);
  registerFacets([matrixOpsFacet]);
}
