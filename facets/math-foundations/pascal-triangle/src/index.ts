import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { pascalTriangle, type PascalTriangleFacetData } from './algorithm.js';
import { pascalTriangleScene } from './scene.js';
import { pascalTriangleIRs } from './irs.js';
import { pascalTriangleStageView } from './pascal-triangle-stage.js';
import { pascalTriangleFacet } from './facet.js';

export { pascalTriangle, nextRow, narrowPascalTriangleData } from './algorithm.js';
export type { PascalTriangleFacetData, PascalSum } from './algorithm.js';
export { pascalTriangleScene } from './scene.js';
export type { PascalTriangleScene, PascalStep } from './scene.js';
export { pascalTriangleIRs } from './irs.js';
export { pascalTriangleStageView } from './pascal-triangle-stage.js';
export { pascalTriangleFacet } from './facet.js';

export function registerPascalTriangle(): void {
  registerAlgorithm<PascalTriangleFacetData>('pascalTriangle', pascalTriangle, { mechanismKind: 'reactive' });
  registerScenePlan('pascalTriangleScene', pascalTriangleScene);
  for (const ir of pascalTriangleIRs) registerIR(ir.id, ir);
  registerView('pascal-triangle-stage', pascalTriangleStageView);
  registerFacets([pascalTriangleFacet]);
}
