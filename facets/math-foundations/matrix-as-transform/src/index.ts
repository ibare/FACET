import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { matrixAsTransform, type MatrixAsTransformFacetData } from './algorithm.js';
import { matrixAsTransformScene } from './scene.js';
import { matrixAsTransformStageView } from './matrix-as-transform-stage.js';
import { matrixAsTransformIRs } from './irs.js';
import { matrixAsTransformFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { matrixAsTransformStageView } from './matrix-as-transform-stage.js';
export { matrixAsTransformIRs } from './irs.js';
export { matrixAsTransformFacet } from './facet.js';

export function registerMatrixAsTransform(): void {
  registerAlgorithm<MatrixAsTransformFacetData>('matrixAsTransform', matrixAsTransform, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('matrixAsTransformScene', matrixAsTransformScene);
  for (const ir of matrixAsTransformIRs) registerIR(ir.id, ir);
  registerView('matrix-as-transform-stage', matrixAsTransformStageView);
  registerFacets([matrixAsTransformFacet]);
}
