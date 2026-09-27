import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { matrixColumnsAreBasis, type MatrixColumnsAreBasisFacetData } from './algorithm.js';
import { matrixColumnsAreBasisScene } from './scene.js';
import { matrixColumnsAreBasisIRs } from './irs.js';
import { matrixColumnsAreBasisStageView } from './matrix-columns-are-basis-stage.js';
import { matrixColumnsAreBasisFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './matrix-columns-are-basis-stage.js';
export * from './facet.js';

export function registerMatrixColumnsAreBasis(): void {
  registerAlgorithm<MatrixColumnsAreBasisFacetData>('matrixColumnsAreBasis', matrixColumnsAreBasis, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('matrixColumnsAreBasisScene', matrixColumnsAreBasisScene);
  for (const ir of matrixColumnsAreBasisIRs) registerIR(ir.id, ir);
  registerView('matrix-columns-are-basis-stage', matrixColumnsAreBasisStageView);
  registerFacets([matrixColumnsAreBasisFacet]);
}
